import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const MODEL = process.env.OPENAI_MODEL || "gpt-6-luna";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

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
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
}

function fallbackReply(message, reminders) {
  const lower = message.toLowerCase();
  if (lower.includes("agenda") || lower.includes("o que tenho") || lower.includes("compromisso")) {
    if (!reminders.length) return "Sua agenda está vazia por enquanto. Posso criar um lembrete para você.";
    const items = reminders
      .slice(0, 5)
      .map((r) => `${r.title} às ${new Date(r.when).toLocaleString("pt-BR")}`)
      .join("\n");
    return `Encontrei estes próximos lembretes:\n${items}`;
  }
  return "Estou funcionando, mas a IA ainda não foi conectada. No Vercel, adicione OPENAI_API_KEY em Settings → Environment Variables e faça um novo deploy.";
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    name: "Hermes",
    version: "2.0.0",
    ai: Boolean(openai),
    model: MODEL
  });
});

app.post("/api/chat", async (req, res) => {
  const message = String(req.body?.message || "").trim();
  const now = String(req.body?.now || new Date().toISOString());
  const timezone = String(req.body?.timezone || "America/Sao_Paulo");
  const memories = Array.isArray(req.body?.memories) ? req.body.memories.slice(0, 50) : [];
  const reminders = Array.isArray(req.body?.reminders) ? req.body.reminders.slice(0, 50) : [];
  const history = safeHistory(req.body?.history);

  if (!message) return res.status(400).json({ error: "Mensagem vazia." });

  if (!openai) {
    return res.json({
      reply: fallbackReply(message, reminders),
      action: "none",
      reminder_title: "",
      reminder_when: "",
      reminder_repeat: "",
      memory_key: "",
      memory_value: "",
      ai: false
    });
  }

  const context = {
    now,
    timezone,
    memories: memories.map((m) => ({ key: String(m.key || ""), value: String(m.value || "") })),
    reminders: reminders.map((r) => ({
      title: String(r.title || ""),
      when: String(r.when || ""),
      repeat: String(r.repeat || "once")
    }))
  };

  const system = `
Você é Hermes, um assistente pessoal em português do Brasil. Seja natural, útil, direto e humano.
Data/hora atual: ${now}. Fuso do usuário: ${timezone}.

Você pode executar UMA ação por mensagem, além de responder.
Ações permitidas:
• none: conversa normal.
• create_reminder: quando o usuário pedir para lembrar de algo. Converta datas relativas para ISO 8601 com o fuso do usuário. Se faltar data ou horário essencial, NÃO invente: faça uma pergunta e use action none.
• list_agenda: quando o usuário pedir agenda, compromissos ou lembretes. Use somente os dados fornecidos, nunca invente eventos.
• save_memory: SOMENTE quando o usuário pedir explicitamente para você lembrar/guardar algo ou quando declarar uma preferência estável que claramente seja útil no futuro. Salve uma frase curta.
• delete_memory: quando pedir para esquecer/remover algo que esteja na memória.

Para create_reminder:
reminder_title deve ser apenas a tarefa.
reminder_when deve ser ISO 8601 completo, com offset quando possível.
reminder_repeat deve ser one_time, daily, weekly ou monthly.

Para save_memory/delete_memory:
memory_key é um identificador curto e memory_value é o conteúdo.

Nunca diga que uma ação foi executada se ela não estiver representada pelo campo action.
Não invente integrações, acesso a calendário ou dados externos.

Contexto local do Hermes:
${JSON.stringify(context)}
`;

  try {
    const response = await openai.responses.create({
      model: MODEL,
      instructions: system,
      input: [
        ...history,
        { role: "user", content: message }
      ],
      max_output_tokens: 700,
      text: {
        format: {
          type: "json_schema",
          name: "hermes_action",
          strict: true,
          schema: HERMES_SCHEMA
        }
      }
    });

    const data = JSON.parse(response.output_text);
    res.json({ ...data, ai: true, model: MODEL });
  }   catch (error) {
    console.error("Hermes AI error:", error);
    res.status(502).json({
      error: error?.message || "Erro ao chamar a OpenAI."
    });
}
});

app.get("*splat", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Hermes 2.0 rodando na porta ${PORT}`);
});
