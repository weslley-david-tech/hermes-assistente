
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

app.use(express.json({ limit: "512kb" }));
app.use(express.static(__dirname));

const HERMES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    reply: { type: "string" },
    action: {
      type: "string",
      enum: ["none", "create_reminder", "list_agenda", "save_memory", "delete_memory"]
    },
    reminder_title: { type: "string" },
    reminder_when: { type: "string" },
    reminder_repeat: { type: "string" },
    memory_key: { type: "string" },
    memory_value: { type: "string" }
  },
  required: [
    "reply",
    "action",
    "reminder_title",
    "reminder_when",
    "reminder_repeat",
    "memory_key",
    "memory_value"
  ]
};

function safeHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .filter(
      m =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string"
    )
    .slice(-12)
    .map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content.slice(0, 4000) }]
    }));
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    name: "Hermes",
    version: "2.0.0",
    ai: Boolean(GEMINI_API_KEY),
    model: MODEL,
    provider: "gemini"
  });
});

app.post("/api/chat", async (req, res) => {
  const message = String(req.body?.message || "").trim();
  const now = String(req.body?.now || new Date().toISOString());
  const timezone = String(
    req.body?.timezone || "America/Sao_Paulo"
  );

  const memories = Array.isArray(req.body?.memories)
    ? req.body.memories.slice(0, 50)
    : [];

  const reminders = Array.isArray(req.body?.reminders)
    ? req.body.reminders.slice(0, 50)
    : [];

  const history = safeHistory(req.body?.history);

  if (!message) {
    return res.status(400).json({
      error: "Mensagem vazia."
    });
  }

  if (!GEMINI_API_KEY) {
    return res.status(500).json({
      error: "GEMINI_API_KEY não configurada no Vercel."
    });
  }

  const context = {
    now,
    timezone,
    memories,
    reminders
  };

  const system = `
Você é Hermes, um assistente pessoal inteligente em português do Brasil.

Seja natural, útil, direto, humano e amigável.

Data e hora atual:
${now}

Fuso:
${timezone}

Você pode executar UMA ação por mensagem.

none:
Conversa normal.

create_reminder:
Quando o usuário pedir para lembrar de algo.
Converta datas relativas para ISO 8601.
Se faltar data ou horário essencial, não invente.
Faça uma pergunta e use action none.

list_agenda:
Quando o usuário pedir agenda, compromissos ou lembretes.
Use somente os dados fornecidos.

save_memory:
Quando o usuário pedir explicitamente para lembrar ou guardar algo.
Também pode usar para preferências estáveis úteis no futuro.

delete_memory:
Quando o usuário pedir para esquecer ou remover algo da memória.

Para create_reminder:
reminder_title = somente a tarefa.
reminder_when = ISO 8601 completo.
reminder_repeat = one_time, daily, weekly ou monthly.

Para save_memory/delete_memory:
memory_key = identificador curto.
memory_value = conteúdo.

Nunca diga que uma ação foi executada se o campo action não representar essa ação.

Não invente acesso a calendário ou dados externos.

Contexto local:
${JSON.stringify(context)}
`;

  const contents = [
    ...history,
    {
      role: "user",
      parts: [{ text: message }]
    }
  ];

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: system }]
          },
          contents,
          generationConfig: {
            responseMimeType: "application/json",
            responseJsonSchema: HERMES_SCHEMA,
            maxOutputTokens: 700
          }
        })
      }
    );

    const raw = await response.text();

    if (!response.ok) {
      console.error("Gemini API error:", raw);

      let details = raw;

      try {
        const parsed = JSON.parse(raw);
        details =
          parsed?.error?.message ||
          parsed?.error?.status ||
          raw;
      } catch {}

      return res.status(502).json({
        error: `Gemini: ${details}`
      });
    }

    const payload = JSON.parse(raw);

    const text =
      payload?.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("") || "";

    if (!text) {
      return res.status(502).json({
        error: "Gemini não retornou uma resposta."
      });
    }

    const data = JSON.parse(text);

    return res.json({
      ...data,
      ai: true,
      model: MODEL,
      provider: "gemini"
    });

  } catch (error) {
    console.error("Hermes Gemini error:", error);

    return res.status(502).json({
      error: error?.message || "Erro ao chamar o Gemini."
    });
  }
});

app.get("*splat", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(
    `Hermes 2.0 com Gemini rodando na porta ${PORT}`
  );
});
