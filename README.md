# Hermes 2.0

Hermes é um PWA de assistente pessoal. A versão 2.0 adiciona uma camada de IA no servidor, memória local e execução de ações estruturadas, mantendo a chave da OpenAI fora do navegador.

## Rodar localmente

```bash
npm install
npm start
```

Abra `http://localhost:3000`.

## Ativar a inteligência artificial

Defina a variável de ambiente `OPENAI_API_KEY`. Opcionalmente, defina `OPENAI_MODEL`.

Exemplo:

```bash
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-6-luna
```

## Vercel

Em Project Settings → Environment Variables, crie `OPENAI_API_KEY` para o ambiente desejado e faça um novo deploy. Nunca coloque a chave no HTML, JavaScript do navegador, GitHub ou em mensagens do chat.

## O que esta versão faz

• Conversa com IA usando a Responses API.
• Saída estruturada para decidir entre conversa, criar lembrete, listar agenda, salvar memória e apagar memória.
• Lembretes e memórias persistidos no navegador.
• Reconhecimento de voz quando disponível no navegador.
• Leitura em voz alta opcional das respostas.
• PWA instalável com Service Worker.
• Endpoint `/api/health` para verificar se a IA está configurada.

## Próximas evoluções

Banco de dados, notificações push confiáveis, autenticação, calendário, pesquisa na web, integrações e painel de automações.
