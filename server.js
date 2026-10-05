import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, name: "Hermes", version: "1.0.0" });
});

/*
  API de IA:
  Na próxima etapa, este endpoint será conectado à OpenAI.
  A chave ficará SOMENTE no servidor, nunca no navegador.
*/
app.post("/api/chat", async (req, res) => {
  const message = String(req.body?.message || "").trim();

  if (!message) {
    return res.status(400).json({ error: "Mensagem vazia." });
  }

  res.json({
    reply: `Entendi, Wes. Recebi: "${message}". Minha conexão com a inteligência artificial será ativada na próxima etapa.`
  });
});

app.get("*splat", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Hermes rodando na porta ${PORT}`);
});