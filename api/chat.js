export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido." });
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "OPENAI_API_KEY ainda não foi configurada no Vercel."
    });
  }

  const { message, previous_response_id } = req.body || {};

  if (!message || typeof message !== "string") {
    return res.status(400).json({
      error: "Mensagem vazia."
    });
  }

  const body = {
    model: process.env.HERMES_MODEL || "gpt-6-luna",

    instructions:
      "Você é Hermes, o assistente pessoal do Wes. " +
      "Responda sempre em português do Brasil, de forma natural, inteligente, amigável e objetiva. " +
      "Entenda linguagem comum, contexto e intenção. " +
      "Você é um assistente pessoal e deve ajudar o usuário a organizar sua vida, tarefas, lembretes e informações. " +
      "Nunca diga que executou uma ação que realmente não foi executada. " +
      "Nunca invente informações.",

    input: [
      {
        role: "user",
        content: message.trim()
      }
    ],

    store: true
  };

  if (previous_response_id) {
    body.previous_response_id = previous_response_id;
  }

  try {
    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",

        headers: {
          "Authorization": "Bearer " + apiKey,
          "Content-Type": "application/json"
        },

        body: JSON.stringify(body)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(data);

      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "Erro ao falar com a inteligência do Hermes."
      });
    }

    return res.status(200).json({
      reply:
        data.output_text ||
        "Não consegui gerar uma resposta.",

      response_id: data.id
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      error: "Erro de conexão com a inteligência do Hermes."
    });
  }
}
