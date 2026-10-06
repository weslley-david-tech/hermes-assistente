import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(
  fileURLToPath(import.meta.url)
);

const app = express();

const PORT =
  process.env.PORT || 3000;


/*
  MODELOS
*/

const MODEL =
  process.env.GEMINI_MODEL ||
  "gemini-2.5-flash-lite";

const IMAGE_MODEL =
  process.env.GEMINI_IMAGE_MODEL ||
  "gemini-2.5-flash-image";

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || "";


/*
  CONFIGURAÇÃO
*/

app.use(
  express.json({
    limit: "4mb"
  })
);

app.use(
  express.static(__dirname)
);


/*
  SCHEMA DO HERMES
*/

const HERMES_SCHEMA = {

  type: "object",

  additionalProperties: false,

  properties: {

    reply: {
      type: "string"
    },

    action: {

      type: "string",

      enum: [
        "none",
        "create_reminder",
        "list_agenda",
        "save_memory",
        "delete_memory"
      ]

    },

    reminder_title: {
      type: "string"
    },

    reminder_when: {
      type: "string"
    },

    reminder_repeat: {
      type: "string"
    },

    memory_key: {
      type: "string"
    },

    memory_value: {
      type: "string"
    }

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


/*
  HISTÓRICO
*/

function safeHistory(history) {

  if (!Array.isArray(history)) {
    return [];
  }

  return history

    .filter(
      item =>
        item &&
        (
          item.role === "user" ||
          item.role === "assistant"
        ) &&
        typeof item.content === "string"
    )

    .slice(-12)

    .map(
      item => ({

        role:
          item.role === "assistant"
            ? "model"
            : "user",

        parts: [

          {
            text:
              item.content.slice(
                0,
                5000
              )
          }

        ]

      })
    );

}


/*
  EXTRAIR TEXTO
*/

function extractText(
  payload
) {

  return (

    payload
      ?.candidates?.[0]
      ?.content
      ?.parts
      ?.map(
        part =>
          part.text || ""
      )
      .join("")

    || ""

  );

}


/*
  EXTRAIR IMAGEM
*/

function extractImage(
  payload
) {

  const parts =
    payload
      ?.candidates?.[0]
      ?.content
      ?.parts || [];


  for (
    const part of parts
  ) {

    if (
      part.inlineData?.data
    ) {

      return {

        data:
          part.inlineData.data,

        mimeType:
          part.inlineData.mimeType ||
          "image/png"

      };

    }

  }

  return null;

}


/*
  NORMALIZAR ANEXO
*/

function normalizeAttachment(
  attachment
) {

  if (
    !attachment ||
    typeof attachment !== "object"
  ) {

    return null;

  }


  const name =
    String(
      attachment.name ||
      "arquivo"
    );


  const mimeType =
    String(
      attachment.mimeType ||
      "application/octet-stream"
    );


  const data =
    String(
      attachment.data ||
      ""
    );


  if (!data) {

    return null;

  }


  return {

    name,

    mimeType,

    data,

    originalName:
      String(
        attachment.originalName ||
        name
      ),

    originalMimeType:
      String(
        attachment.originalMimeType ||
        mimeType
      ),

    extension:
      String(
        attachment.extension ||
        ""
      ),

    converted:
      Boolean(
        attachment.converted
      )

  };

}


/*
  ARQUIVO TEXTO
*/

function isTextFile(
  mimeType,
  name
) {

  const mime =
    String(
      mimeType || ""
    ).toLowerCase();


  const filename =
    String(
      name || ""
    ).toLowerCase();


  return (

    mime.startsWith("text/") ||

    mime.includes("json") ||

    mime.includes("csv") ||

    mime.includes("markdown") ||

    /\.(txt|csv|json|md|rtf)$/i.test(
      filename
    )

  );

}


/*
  ARQUIVO PDF
*/

function isPdf(
  mimeType,
  name
) {

  const mime =
    String(
      mimeType || ""
    ).toLowerCase();


  const filename =
    String(
      name || ""
    ).toLowerCase();


  return (

    mime ===
      "application/pdf" ||

    filename.endsWith(".pdf")

  );

}


/*
  IMAGEM
*/

function isImage(
  mimeType
) {

  return String(
    mimeType || ""
  )
    .toLowerCase()
    .startsWith(
      "image/"
    );

}


/*
  CRIAR PART DO ANEXO
*/

function buildAttachmentPart(
  attachment
) {

  /*
    CSV, TXT, JSON, MD
    e arquivos convertidos
    pelo frontend
  */

  if (
    attachment.converted ||
    isTextFile(
      attachment.mimeType,
      attachment.name
    )
  ) {

    let decoded = "";


    try {

      decoded =
        Buffer
          .from(
            attachment.data,
            "base64"
          )
          .toString(
            "utf8"
          );

    } catch {

      decoded =
        "[Não foi possível ler o conteúdo textual do arquivo.]";

    }


    return {

      text:

        `

ARQUIVO ANEXADO

Nome:
${attachment.originalName}

Tipo:
${attachment.originalMimeType}

Conteúdo:

${decoded.slice(
  0,
  150000
)}

`

    };

  }


  /*
    PDF, imagem e outros formatos
  */

  return {

    inline_data: {

      mime_type:
        attachment.mimeType,

      data:
        attachment.data

    }

  };

}


/*
  HEALTH
*/

app.get(
  "/api/health",
  (_req, res) => {

    res.json({

      ok: true,

      name:
        "Hermes",

      version:
        "4.0.0",

      ai:
        Boolean(
          GEMINI_API_KEY
        ),

      model:
        MODEL,

      imageModel:
        IMAGE_MODEL,

      provider:
        "gemini",

      features: {

        chat:
          true,

        images:
          true,

        imageEditing:
          true,

        pdf:
          true,

        excel:
          true,

        csv:
          true,

        docx:
          true,

        txt:
          true,

        json:
          true,

        markdown:
          true,

        reminders:
          true,

        memory:
          true

      }

    });

  }
);


/*
  CHAT PRINCIPAL
*/

app.post(
  "/api/chat",
  async (req, res) => {

    const message =
      String(
        req.body?.message ||
        ""
      ).trim();


    const now =
      String(
        req.body?.now ||
        new Date().toISOString()
      );


    const timezone =
      String(
        req.body?.timezone ||
        "America/Sao_Paulo"
      );


    const memories =
      Array.isArray(
        req.body?.memories
      )
        ? req.body.memories.slice(
            0,
            50
          )
        : [];


    const reminders =
      Array.isArray(
        req.body?.reminders
      )
        ? req.body.reminders.slice(
            0,
            50
          )
        : [];


    const history =
      safeHistory(
        req.body?.history
      );


    const attachment =
      normalizeAttachment(
        req.body?.attachment
      );


    if (
      !message &&
      !attachment
    ) {

      return res
        .status(400)
        .json({

          error:
            "Mensagem vazia."

        });

    }


    if (
      !GEMINI_API_KEY
    ) {

      return res
        .status(500)
        .json({

          error:
            "GEMINI_API_KEY não configurada no Vercel."

        });

    }


    /*
      IDENTIFICA O TIPO DO ANEXO
    */

    let attachmentDescription =
      "";


    if (attachment) {

      if (
        isImage(
          attachment.mimeType
        )
      ) {

        attachmentDescription =
          `

O usuário enviou uma imagem.

Nome:
${attachment.originalName}

Analise visualmente a imagem.

Se houver texto visível,
faça OCR quando solicitado.

Se o usuário perguntar sobre
pessoas, objetos, ambiente,
documentos ou detalhes visuais,
responda com base somente no
que realmente estiver visível.

`;

      }

      else if (
        isPdf(
          attachment.mimeType,
          attachment.name
        )
      ) {

        attachmentDescription =
          `

O usuário enviou um PDF.

Analise o conteúdo do PDF.

Considere:

• texto
• tabelas
• gráficos
• imagens
• estrutura
• números
• títulos
• informações relevantes

Não invente informações.

`;

      }

      else {

        attachmentDescription =
          `

O usuário enviou um documento.

Analise o conteúdo disponível.

Se for uma planilha,
interprete linhas, colunas,
valores, totais e padrões.

Se for um documento,
identifique os pontos principais.

Não invente informações.

`;

      }

    }


    /*
      CONTEXTO
    */

    const context = {

      now,

      timezone,

      memories,

      reminders

    };


    /*
      INSTRUÇÕES
    */

    const system = `

Você é Hermes, um assistente pessoal inteligente em português
