import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import makeWASocket, {
    useMultiFileAuthState,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion,
    DisconnectReason,
    Browsers,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import googleapisPkg from 'googleapis';
const { google } = googleapisPkg;
import Groq from 'groq-sdk';
import pino from 'pino';

// === Variáveis para controle de tempo (debounce) ===
const messageTimers = new Map();
const messageQueues = new Map();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// === CONFIGURAÇÃO MENSAL DE DATAS DE LASER ===
const DATAS_LASER_MES = "Neste mês, o Laser será dia 10 em Patrocínio, dia 15 em Patos de Minas e dia 20 em Guimarânia.";

// CONFIGURAÇÕES VIA ENV
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const NOME_ABA = process.env.NOME_ABA || "agenda_setembro";

if (!GROQ_API_KEY || !SPREADSHEET_ID) {
    console.error('❌ Faltam variáveis de ambiente obrigatórias (GROQ_API_KEY e/ou SPREADSHEET_ID).');
    process.exit(1);
}

const logger = pino({ level: 'error' });
const groq = new Groq({ apiKey: GROQ_API_KEY });

// === IMPLEMENTAÇÃO DA MEMÓRIA DE CONVERSA ===
const historicoConversas = new Map();
const LIMITE_MENSAGENS = 12;

function atualizarHistorico(jid, role, content) {
    if (!historicoConversas.has(jid)) {
        historicoConversas.set(jid, []);
    }
    const historico = historicoConversas.get(jid);
    historico.push({ role, content });

    if (historico.length > LIMITE_MENSAGENS) {
        historico.shift();
    }
}

const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, 'credentials.json'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
let sheetsClient;

async function getSheetsClient() {
    if (!sheetsClient) {
        const authClient = await auth.getClient();
        sheetsClient = google.sheets({ version: 'v4', auth: authClient });
    }
    return sheetsClient;
}

// ============================================================================
// NOVAS FUNÇÕES AUXILIARES (JS responsável por identificar cidade)
// ============================================================================

// Identifica menção de cidade na string recebida ignorando acentos e maiúsculas
function identificarCidade(texto) {
    if (!texto) return null;
    const txtNormalizado = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    
    if (txtNormalizado.includes('patrocinio')) return 'Patrocínio';
    if (txtNormalizado.includes('patos')) return 'Patos de Minas';
    if (txtNormalizado.includes('guimarania')) return 'Guimarânia';
    
    return null;
}

// Vasculha a mensagem atual e o histórico recente para reter a cidade escolhida
function buscarCidadeNoHistorico(jid, textoUsuario) {
    let cidade = identificarCidade(textoUsuario);
    if (cidade) return cidade;

    const historico = historicoConversas.get(jid) || [];
    // Busca de trás para frente no histórico para pegar a cidade mais recente mencionada
    for (let i = historico.length - 1; i >= 0; i--) {
        if (historico[i].role === 'user') {
            cidade = identificarCidade(historico[i].content);
            if (cidade) return cidade;
        }
    }
    return null;
}

// ============================================================================
// FUNÇÃO ALTERADA: Retorna apenas estrutura JSON e filtra a cidade requerida
// ============================================================================
async function obterHorarios(cidadeEscolhida) {
    // Se não há cidade identificada, retorna um alerta interno para o Grok não oferecer nada
    if (!cidadeEscolhida) {
        return '{"aviso": "[SISTEMA: O JavaScript ainda não identificou a cidade. Não invente horários. Continue conversando e pergunte em qual cidade ela deseja atendimento.]"}';
    }

    try {
        const sheets = await getSheetsClient();
        const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${NOME_ABA}!A:F` });
        const rows = res.data.values || [];

        const agendaFiltrada = {};

        rows.forEach(r => {
            const dia = r[0]?.trim();
            const hora = r[1]?.trim();
            const status = r[2]?.toLowerCase().trim();
            const cidadePlanilha = r[5]?.trim() || 'Não informada';

            // JS filtra estritamente por "disponível" e pela cidade detectada
            if (status === 'disponível' && dia && hora && cidadePlanilha.toLowerCase() === cidadeEscolhida.toLowerCase()) {
                if (!agendaFiltrada[dia]) agendaFiltrada[dia] = [];
                agendaFiltrada[dia].push(hora);
            }
        });

        // Retorna alerta via JSON caso a cidade não tenha nenhum horário
        if (Object.keys(agendaFiltrada).length === 0) {
            return JSON.stringify({ aviso: `Não há horários disponíveis na planilha para ${cidadeEscolhida} no momento. Informe isso à cliente.` });
        }

        // Retorna a estrutura (JSON) puramente com os dias e horários livres
        return JSON.stringify(agendaFiltrada, null, 2);

    } catch (e) {
        console.error("Erro ao obter horários:", e);
        return '{"aviso": "Erro no sistema de planilha."}';
    }
}

// === AUXILIAR DE MATEMÁTICA PARA SLOTS DE 15 MIN ===
function adicionar15Minutos(horaStr) {
    let [h, m] = horaStr.split(':').map(Number);
    m += 15;
    if (m >= 60) {
        h += 1;
        m -= 60;
    }
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

async function salvarAgendamento(dia, hora, procedimento, cliente, cidade, blocos) {
    try {
        const sheets = await getSheetsClient();
        const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${NOME_ABA}!A:F` });
        const rows = res.data.values || [];

        const diaNorm = dia.trim().toLowerCase();
        let horaAtual = hora.trim();
        const quantidadeBlocos = parseInt(blocos, 10) || 1;
        const linhasParaAtualizar = [];

        // 1. Validar se TODOS os blocos consecutivos estão disponíveis
        for (let b = 0; b < quantidadeBlocos; b++) {
            const rowIndex = rows.findIndex((r, idx) =>
                idx > 0 && 
                (r[0] || '').trim().toLowerCase() === diaNorm &&
                (r[1] || '').trim() === horaAtual &&
                (r[2] || '').trim().toLowerCase() === 'disponível'
            );

            if (rowIndex === -1) {
                return false; 
            }
            
            linhasParaAtualizar.push(rowIndex + 1);
            horaAtual = adicionar15Minutos(horaAtual);
        }

        // 2. Bloquear todos os horários encontrados sequencialmente
        for (const linha of linhasParaAtualizar) {
            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `${NOME_ABA}!C${linha}:F${linha}`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [['Ocupado', procedimento, cliente, cidade]] }
            });
        }
        
        return true;
    } catch (e) {
        console.error("Erro ao salvar agendamento na planilha:", e);
        return false;
    }
}

function extrairTextoDaMensagem(message) {
    if (!message) return null;
    const conteudo = message.ephemeralMessage?.message || message.viewOnceMessage?.message || message.viewOnceMessageV2?.message || message;
    return conteudo.conversation || conteudo.extendedTextMessage?.text || conteudo.imageMessage?.caption || conteudo.videoMessage?.caption || null;
}

async function gerarRespostaIA(jid, textoUsuario) {
    // JS identifica a cidade antes de buscar na planilha
    const cidadeEscolhida = buscarCidadeNoHistorico(jid, textoUsuario);
    // JS obtém exclusivamente o objeto JSON da cidade
    const listaHorarios = await obterHorarios(cidadeEscolhida);

    const promptSistema = `Você é Ceci, assistente virtual da clínica "Estética Marisa Soares Estética e Saúde".
Sua persona é acolhedora e simpática, mas seu funcionamento é EXTREMAMENTE OBJETIVO, RÁPIDO e DIRETO.

[REGRAS DE COMPORTAMENTO E FORMATAÇÃO - OBRIGATÓRIAS]
1. TAMANHO MÁXIMO: Nenhuma resposta pode ter mais de 2 parágrafos curtos.
2. LEITURA: Sempre pule linhas para separar blocos de texto.
3. EMOJIS: Use no máximo 2 emojis por resposta (ex: ✨, 🌸, 🗓️, 🥰).
4. SAUDAÇÃO INTELIGENTE: Diga que você é a Ceci APENAS na primeira mensagem. Depois, responda diretamente.
5. NEGRITO: Use *asteriscos* para destacar nomes de procedimentos, valores e cidades.
6. GATILHO DE ENDEREÇO: Envie endereços apenas se a cliente solicitar explicitamente.
7. MÚLTIPLAS MENSAGENS: Se a cliente enviar várias mensagens seguidas, avalie todo o conteúdo acumulado como um único contexto antes de responder.
8. PROIBIÇÕES ESTRITAS: Você NÃO PODE inventar datas, horários, cidades, disponibilidades, lista de espera, encaixes ou cancelamentos. Use EXCLUSIVAMENTE o JSON de Horários Livres enviado abaixo. Deduzir horários não listados é estritamente proibido. Se não houver horários, informe que não há disponibilidade.

[NOSSAS UNIDADES / ENDEREÇOS]
- *Guimarânia - MG*: Praça Pedro Guimarães, número 3, Sala 2, segundo andar.
- *Patrocínio - MG*: Rua Elias Alves Cunha, 170 – Bairro Cidade Jardim.
- *Patos de Minas - MG*: (Aguardando endereço - informe que será enviado junto com a confirmação).

[CALENDÁRIO ATUAL]
${DATAS_LASER_MES}

### REGRAS CRÍTICAS DE NEGÓCIO E LÓGICA DE AGENDAMENTO
Você deve seguir rigorosamente as regras abaixo antes de responder ao cliente ou confirmar qualquer horário. Pense passo a passo.

**1. LÓGICA DE DATAS E LOCALIZAÇÃO (LASER vs. ROTINA)**
* **Serviços de Rotina (Todos, exceto Laser):** Ocorrem EXCLUSIVAMENTE na cidade de Guimarânia. Os dias de funcionamento são de Terça a Sábado.
* **Depilação a Laser (Exceção Itinerante):** Este serviço só acontece nas DATAS ESPECÍFICAS previamente definidas no calendário atual acima. A cada data de Laser, o atendimento será em uma cidade específica (Patrocínio, Patos de Minas ou Guimarânia).
* **Regra de Conflito:** Nos dias marcados para Depilação a Laser, TODOS os outros serviços de rotina estão SUSPENSOS. A agenda da profissional será dedicada 100% ao Laser na cidade designada para aquele dia. Se um cliente pedir um serviço comum em dia de Laser, informe que a data é exclusiva para Laser e ofereça o próximo dia útil disponível em Guimarânia.

**2. MATEMÁTICA DE AGENDAMENTO (SLOTS DE 15 MINUTOS)**
* A agenda funciona em blocos rígidos de 15 minutos (ex: 14:00, 14:15, 14:30).
* Você é responsável por calcular o tempo total do procedimento solicitado (ver tabela abaixo) e bloquear os horários de forma CONSECUTIVA.
* **Regra de Cálculo:**
  - Procedimentos de 15 min = Ocupa 1 bloco (Ex: 14:00 às 14:15).
  - Procedimentos de 30 min = Ocupa 2 blocos seguidos (Ex: 14:00 às 14:30).
  - Procedimentos de 45 min = Ocupa 3 blocos seguidos (Ex: 14:00 às 14:45).
  - Procedimentos longos (Estética Facial) = Converta horas em minutos e divida por 15. (Ex: 2 horas = 120 min = 8 blocos).
* **Verificação Obrigatória:** ANTES de confirmar o horário, verifique na sua base de Horários Livres Agrupados se há blocos contínuos suficientes livres. Se o serviço dura 45 minutos (3 blocos), você NÃO pode agendar às 14:00 se o horário de 14:15 não constar na lista.

**3. AUTONOMIA E RESOLUÇÃO DE PROBLEMAS (NÃO TRANSFIRA FACILMENTE)**
* Você é uma assistente inteligente. Tem acesso a todas as informações de tempo, preços e locais.
* **NÃO** responda que "vai encaminhar para um profissional" por preguiça cognitiva. Se o cliente perguntar sobre agendamento, horários, preços ou preparos, PENSE PASSO A PASSO, deduza a partir das regras e resolva.
* Você SÓ deve transferir para um humano em três cenários rigorosos: 
  1. O cliente relata reação alérgica, queimadura ou problema médico grave.
  2. O cliente insiste agressivamente.
  3. O cliente pede um serviço ou parceria comercial que não existe na sua base de forma alguma.

[TABELA DE PROCEDIMENTOS, TEMPO E VALORES]
*Combos de Depilação a Laser:*
- *Buço + Axilas + Virilha + Pernas + Pés*: R$ 250,00 (Duração: 30min / 2 Blocos)
- *Virilha + Pernas + Pés*: R$ 230,00 (Duração: 30min / 2 Blocos)
- *Axilas + Virilha + 1/2 Perna + Pés*: R$ 180,00 (Duração: 30min / 2 Blocos)
- *Buço + Axilas + Virilha*: R$ 140,00 (Duração: 15min / 1 Bloco)
- *Axilas + Virilha* ou *Braço + Ante-Braço + Mãos*: R$ 100,00 (Duração: 15min / 1 Bloco)
- *Buço + Mento (queixo)*: R$ 50,00 (Duração: 15min / 1 Bloco)

*Laser por Área Individual:*
- *Corpo inteiro*: R$ 310,00 (Duração: 60min / 4 Blocos)
- *Pernas Completas*: R$ 180,00 (Duração: 30min / 2 Blocos)
- *Costas*: R$ 120,00 (Duração: 30min / 2 Blocos)
- *Coxa* ou *Meia Perna*: R$ 100,00 (Duração: 15min / 1 Bloco)
- *Virilha*: R$ 80,00 (Duração: 15min / 1 Bloco)
- *Rosto + Pescoço*: R$ 70,00 (Duração: 15min / 1 Bloco)
- Áreas pequenas (Axilas, Barriga, Glúteos, Barba, Pescoço, Aréolas, Lombar, Buço, Orelhas, Linha Alba): Entre R$40 e R$60 (Duração: 15min / 1 Bloco)

*Estética Facial e Cuidados (Calcular blocos exatos na tag)*:
- *Limpeza de Pele Peeling Químico*: R$ 150,00 (Duração: 3h30 / 14 Blocos)
- *Limpeza de Pele Profunda*: R$ 130,00 (Duração: 3h00 / 12 Blocos)
- *Limpeza de Pele Simples* ou *Spa dos Pés*: R$ 70,00 (Duração: 2h / 8 Blocos)
- *Lavieen (Rosto+Pescoço+Colo)*: R$ 450,00 (Duração: 60min / 4 Blocos) 
- *Lavieen (Mãos+Braços)* ou *(Couro Cabeludo)*: R$ 200,00 (Duração: 30min / 2 Blocos)
- *Botox (Região da Face)*: R$ 750,00 (Duração: 30min / 2 Blocos)

[HORÁRIOS LIVRES AGRUPADOS (SEU MAPA DE BUSCA):]
${listaHorarios}

[FLUXO DE AGENDAMENTO - PASSO A PASSO]
Você é um funil de triagem. Siga estritamente:
PASSO 1: Pergunte o *Nome Completo* e a *Cidade* de atendimento. NÃO mostre horários aqui.
PASSO 2: Ao saber a cidade e cruzar com as restrições de calendário, consulte a lista de horários. Ofereça APENAS 3 horários iniciais compatíveis (certifique-se de que tenham blocos subsequentes livres dependendo do procedimento). Confirme o horário.
PASSO 3: Com tudo validado, encerre com a tag de sistema EXATAMENTE neste formato para comunicar o código JavaScript: 
[AGENDAR: Dia | Horário Inicial | Procedimento | Nome do Cliente | Cidade | Número de Blocos]

Exemplo de tag: [AGENDAR: 15 | 14:30 | Limpeza de Pele Simples | Maria Silva | Guimarânia | 8]`;

    const mensagensAnteriores = historicoConversas.get(jid) || [];

    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: promptSistema },
                ...mensagensAnteriores,
                { role: "user", content: textoUsuario }
            ],
            model: "openai/gpt-oss-120b",
            temperature: 0.1,
        });

        return chatCompletion.choices[0]?.message?.content || "Desculpe, não consegui processar sua mensagem.";
    } catch (error) {
        console.error("Erro na API da Groq:", error);
        return "Para sua total segurança e te passar informações exatas, vou pedir para uma de nossas especialistas te dar esse suporte por aqui em instantes, tá bom? ✨";
    }
}

let versaoWA; 
async function iniciarBot() {
    if (!versaoWA) {
        const { version, isLatest } = await fetchLatestBaileysVersion();
        versaoWA = version;
        console.log(`ℹ️  Usando WhatsApp Web v${version.join('.')} (é a mais recente: ${isLatest})`);
    }

    const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'auth_info_baileys'));

    const sock = makeWASocket({
        version: versaoWA,
        logger,
        browser: Browsers.ubuntu('Ceci Bot'),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        getMessage: async () => undefined,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) qrcode.generate(qr, { small: true });
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const deveReconectar = statusCode !== DisconnectReason.loggedOut;
            if (deveReconectar) setTimeout(iniciarBot, 3000);
        } else if (connection === 'open') {
            console.log('✅ Bot Online com Sucesso via Groq!');
        }
    });

    sock.ev.on('messages.upsert', async m => {
        try {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;

            if (msg.key.remoteJid === 'status@broadcast') return;

            const jid = msg.key.remoteJid;
            const txt = extrairTextoDaMensagem(msg.message);
            if (!txt || !txt.trim()) return;

            // Lógica de Debounce (Espera 20 segundos)
            if (messageTimers.has(jid)) clearTimeout(messageTimers.get(jid));
            if (!messageQueues.has(jid)) messageQueues.set(jid, []);
            messageQueues.get(jid).push(txt);

            console.log(`📩 Mensagem de ${jid}: "${txt}". Aguardando processamento...`);

            const timer = setTimeout(async () => {
                const mensagensAcumuladas = messageQueues.get(jid).join(' | ');
                messageQueues.delete(jid);
                messageTimers.delete(jid);

                console.log(`⏳ Processando contexto acumulado de ${jid}...`);

                let resposta = await gerarRespostaIA(jid, mensagensAcumuladas);
                console.log(`🤖 Resposta gerada.`);

                if (resposta.includes('[AGENDAR:')) {
                    const match = resposta.match(/\[AGENDAR:\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|\]]+?)\s*\|\s*(\d+)\s*\]/i);
                    if (match) {
                        const salvo = await salvarAgendamento(match[1], match[2], match[3], match[4], match[5], match[6]);
                        if (salvo) {
                            resposta = resposta.replace(/\[AGENDAR:.*?\]/gi, "").trim() + "\n\nAgendamento confirmado com sucesso! 🗓️✨";
                        } else {
                            resposta = "Desculpe, esse horário não possui blocos consecutivos livres suficientes para o seu procedimento ou ocorreu um erro na marcação. Poderia escolher outro horário? 🌸";
                        }
                    } else {
                        resposta = resposta.replace(/\[AGENDAR:.*?\]/gi, "").trim(); 
                    }
                }

                atualizarHistorico(jid, "user", mensagensAcumuladas);
                atualizarHistorico(jid, "assistant", resposta);
                await sock.sendMessage(jid, { text: resposta });

            }, 20000); // 20 segundos

            messageTimers.set(jid, timer);

        } catch (error) {
            console.error("Erro no processamento da mensagem:", error);
        }
    });
}

process.on('unhandledRejection', (motivo) => console.error('Erro não tratado:', motivo));
process.on('uncaughtException', (erro) => console.error('Exceção não tratada:', erro));

iniciarBot();