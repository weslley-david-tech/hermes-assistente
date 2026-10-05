# Hermes PWA

Primeira versão do Hermes, assistente pessoal instalável como PWA.

## Rodar localmente
1. Instale Node.js.
2. Execute `npm install`.
3. Execute `npm start`.
4. Abra `http://localhost:3000`.

## Publicação
Pode ser publicado em serviços compatíveis com Node.js, como Render, Railway ou Vercel (adaptando o servidor).

## Próxima etapa
Conectar `/api/chat` à OpenAI no servidor. A chave deve ficar em variável de ambiente, nunca no navegador.

## Observação
Notificações web dependem de HTTPS e da permissão do usuário. Para lembretes confiáveis mesmo com o navegador fechado, a próxima etapa deve usar Web Push com um backend e agendamento no servidor.
