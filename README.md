# 🤖 Bot de Agendamento - Clínica Marisa Soares

Este é o sistema de atendimento inteligente via WhatsApp da Clínica Marisa Soares. O bot utiliza inteligência artificial para entender as solicitações dos clientes, verificar disponibilidade na agenda (Google Sheets) e realizar agendamentos automaticamente de forma segura e organizada.

# OBSERVAÇÕES ESSENCIAIS DO PROJETO

O projeto foi desenvolvido com a **ajuda de IAs** (Gemini e Claude) após meu encerramento do primeiro período (Sistemas de Informação - UFV), com o objetivo de facilitar o dia a dia da empresa (Marisa Soares Estética e Saúde) de forma **voluntária**.

## ✨ Funcionalidades

*   **Atendimento Automatizado:** Respostas rápidas baseadas em IA (Groq).
*   **Integração com Google Sheets:** Sincronização em tempo real da agenda da clínica.
*   **Lógica de Agendamento:** Validação automática de blocos de tempo (15 min) e regras de negócio para procedimentos.
*   **Gestão Inteligente:** Filtros para mensagens de Status, lógica de *debounce* (acumulo de mensagens para evitar respostas picadas) e memória de conversa.
*   **Resiliência:** Reconexão automática ao WhatsApp e tratamento de erros.

## 🚀 Como instalar

1. **Clone o repositório:**
   ```bash
   git clone [https://github.com/SEU_USUARIO/bot-clinica-nova.git](https://github.com/SEU_USUARIO/bot-clinica-nova.git)
   cd bot-clinica-nova