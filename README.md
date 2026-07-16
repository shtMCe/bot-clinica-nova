# Bot Ceci — Estética Marisa Soares

## 🚨 Antes de tudo: revogue as duas chaves que vazaram

Os arquivos que você me enviou continham segredos reais e válidos. Como eles passaram por este chat,
trate os dois como comprometidos e troque-os **antes** de colocar o bot no ar:

1. **Chave da conta de serviço do Google** (`credentials.json`)
   - Acesse [console.cloud.google.com](https://console.cloud.google.com/) → *IAM e administrador* → *Contas de serviço*
   - Abra `bot-sheets@integral-legend-501220-e3.iam.gserviceaccount.com`
   - Na aba **Chaves**, exclua a chave com ID iniciando em `b7ad970ea767...`
   - Clique em **Adicionar chave → Criar nova chave → JSON**, baixe o arquivo e substitua o `credentials.json` do projeto por ele.

2. **Chave da Groq** (estava no seu `_env`)
   - Acesse [console.groq.com/keys](https://console.groq.com/keys)
   - Revogue a chave que começa com `gsk_fboDni...`
   - Crie uma nova e coloque no seu `.env` (veja abaixo).

Isso não tem relação com nenhum bug do código — é só uma boa prática de segurança sempre que uma chave é exposta.

## O que estava quebrado

- **Baileys não carregava de jeito nenhum**: a versão instalada (`7.0.0-rc13`) só existe em formato ESM desde a v6.8, mas o projeto usava `require()` num pacote `"type": "commonjs"`. Isso derruba o processo assim que ele tenta ler a lib. Convertido o projeto inteiro para ESM (`"type": "module"` + `import`).
- **O modelo da Groq (`llama3-70b-8192`) foi descontinuado** em 2025 — toda chamada à IA voltava erro 400 e caía na mensagem de fallback. Troquei para `openai/gpt-oss-120b`, o modelo de produção atual recomendado pela própria Groq para substituir esse (o substituto mais "óbvio", `llama-3.3-70b-versatile`, também está sendo descontinuado agora em 2026, então evitei ele).
- **Sem reconexão automática**: se a conexão do WhatsApp caísse (o que acontece com frequência), o bot morria e não voltava sozinho. Adicionei a lógica padrão de reconexão.
- **`pino` estava no `package.json` mas nunca era usado**: o Baileys exige um logger; sem ele, o comportamento fica instável. Agora ele é criado e passado corretamente.
- **Sem validação de variáveis de ambiente**: se faltasse `GROQ_API_KEY`/`SPREADSHEET_ID` (por exemplo pelo arquivo estar `_env` em vez de `.env` — reparei que o seu estava assim!), o bot falhava de forma confusa lá na frente. Agora ele avisa exatamente o que falta e para.
- Pequenos reforços: mensagens temporárias/"visualizar uma vez" agora são lidas corretamente (antes eram ignoradas), a versão do WhatsApp Web é buscada e fixada na conexão, e erros inesperados não derrubam mais o processo inteiro.

## Como rodar

```bash
npm install
cp .env.example .env    # depois edite o .env com suas chaves NOVAS
npm start
```

Escaneie o QR code que aparecer no terminal com o WhatsApp do número que vai atender (Aparelho conectado).

## Isso roda de graça?

- **Groq**: sim, tem plano gratuito sem cartão de crédito, mas com limite de requisições por dia. Se o consultório bombar de mensagens, você pode bater esse limite (erro 429) — dá pra conferir o limite exato em [console.groq.com/settings/limits](https://console.groq.com/settings/limits).
- **Google Sheets API**: gratuita para esse volume de uso.
- **Baileys/WhatsApp**: gratuito, mas é uma biblioteca não-oficial — ela imita o WhatsApp Web, o que tecnicamente viola os Termos de Serviço do WhatsApp. Na prática é super usado por pequenos negócios no Brasil, mas existe risco (baixo, porém real) do número ser bloqueado. Evite disparar mensagens em massa pelo mesmo número para reduzir esse risco.

## Se `npm install` falhar

O Baileys depende de componentes nativos (ex: `sharp`, para imagens). Se o install travar, geralmente é por causa de uma dessas binárias não ter versão pronta pra sua plataforma — confira se está com Node **20.9 ou mais recente** primeiro.
