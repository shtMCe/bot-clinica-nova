# 🤖 Bot de Agendamento - Clínica Marisa Soares

[![Nível](https://img.shields.io/badge/Status-Em_Desenvolvimento-brightgreen)]()
[![Tecnologia](https://img.shields.io/badge/Node.js-339933?logo=nodedotjs&logoColor=white)]()
[![IA](https://img.shields.io/badge/Groq-AI-blue)]()

Bem-vindo ao repositório do **Assistente Virtual Inteligente** da Clínica Marisa Soares. Este projeto nasceu da necessidade real de automatizar o agendamento de procedimentos, otimizando o fluxo de trabalho da clínica e permitindo um atendimento 24/7 de alta qualidade.

---

## 👨‍💻 Sobre o Desenvolvedor
Olá! Meu nome é **MARIA CECÍLIA**. Sou estudante de **Sistemas de Informação na Universidade Federal de Viçosa (UFV)**. Este projeto foi desenvolvido voluntariamente logo após o encerramento do meu primeiro período, motivado pelo desejo de aplicar conceitos de lógica de programação para resolver problemas reais e impactar positivamente o negócio da clínica.

### O papel da IA no desenvolvimento
Este projeto foi construído com o auxílio de ferramentas de IA (Gemini e Claude). Entendo o uso de IAs como uma ferramenta fundamental para o desenvolvedor moderno, utilizando-as para acelerar a curva de aprendizado, estruturar a arquitetura e resolver desafios de *debugging* e mantendo sempre o controle total.

---

## 🚀 O Projeto

O bot atua como um sistema de triagem e agendamento que se integra diretamente ao Google Sheets. Ele não apenas responde, mas **raciocina**: entende a intenção do cliente, valida a disponibilidade de horários, verifica se há blocos consecutivos suficientes para o procedimento e finaliza o agendamento automaticamente.

### ✨ Funcionalidades Principais
*   **Atendimento Automatizado:** Utilização da API Groq para processamento de linguagem natural, garantindo respostas empáticas e objetivas.
*   **Integração com Google Sheets:** Sincronização em tempo real da agenda da clínica (via API do Google).
*   **Gestão de Memória:** O bot mantém um histórico de conversa para oferecer continuidade, mas com limite para otimização de performance.
*   **Debounce Inteligente:** O sistema aguarda o acúmulo de mensagens para processar o contexto completo, evitando respostas picadas e melhorando a experiência do usuário.
*   **Segurança e Resiliência:** Tratamento de erros robusto, reconexão automática e proteção de dados sensíveis.

---

## 🛠 Tecnologias Utilizadas

*   **Linguagem:** JavaScript (Node.js)
*   **Biblioteca WhatsApp:** [Baileys](https://github.com/WhiskeySockets/Baileys)
*   **Inteligência Artificial:** [Groq Cloud](https://groq.com/)
*   **Banco de Dados:** Google Sheets API v4
*   **Ambiente:** Windows/Linux (Node runtime)

---

## ⚙️ Como Instalar e Rodar

1. **Pré-requisitos:**
   - [Node.js](https://nodejs.org/) (versão LTS recomendada)
   - Conta no Google Cloud (para a API do Sheets)
   - Chave de API do [Groq](https://console.groq.com/)

2. **Clonando o repositório:**
   ```bash
   git clone [https://github.com/SEU_USUARIO/bot-clinica-nova.git](https://github.com/SEU_USUARIO/bot-clinica-nova.git)
   cd bot-clinica-nova