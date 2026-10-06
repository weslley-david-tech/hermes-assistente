import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

const PORT =
  process.env.PORT || 3000;

const MODEL =
  process.env.GEMINI_MODEL ||
  "gemini-3.5-flash-lite";

const IMAGE_MODEL =
  process.env.GEMINI_IMAGE_MODEL ||
  "gemini-2.5-flash-image";

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || "";


/*
  O Vercel limita o payload das Functions.
  Mantemos o limite abaixo de 4.5 MB.
*/

app.use(
  express.json({
    limit: "4mb"
  })
);

app.use(
  express.static(__dirname)
);


const HERMES_SCHEMA = {

  type: "object",

  additionalProperties: false,

  properties: {

    reply:{
      type:"string"
    },

    action:{
      type:"string",
      enum:[
        "none",
        "create_reminder",
        "list_agenda",
        "save_memory",
        "delete_memory"
      ]
    },

    reminder_title:{
      type:"string"
    },

    reminder_when:{
      type:"string"
    },

    reminder_repeat:{
      type:"string"
    },

    memory_key:{
      type:"string"
    },

    memory_value:{
      type:"string"
    }

  },

  required:[
    "reply",
    "action",
    "reminder_title",
    "reminder_when",
    "reminder_repeat",
    "memory_key",
    "memory_value"
  ]

};


function safeHistory(history){

  if(
    !Array.isArray(history)
  ){

    return [];

  }

  return history
    .filter(
      m=>
        m &&
        (
          m.role==="user" ||
          m.role==="assistant"
        ) &&
        typeof m.content==="string"
    )
    .slice(-12)
    .map(
      m=>({

        role:
          m.role==="assistant"
            ?"model"
            :"user",

        parts:[
          {
            text:
              m.content
                .slice(0,4000)
          }
        ]

      })
    );

}


function extractText(payload){

  return (
    payload
      ?.candidates?.[0]
      ?.content?.parts
      ?.map(
        part=>part.text||""
      )
      .join("") || ""
  );

}


function extractImage(payload){

  const parts=
    payload
      ?.candidates?.[0]
      ?.content
      ?.parts || [];

  for(
    const part of parts
  ){

    if(
      part.inlineData?.data
    ){

      return {

        data:
          part.inlineData.data,

        mimeType:
          part.inlineData.mimeType||
          "image/png"

      };

    }

  }

  return null;

}


function normalizeAttachment(
  attachment
){

  if(
    !attachment ||
    typeof attachment!=="object"
  ){

    return null;

  }

  const name=
    String(
      attachment.name||"arquivo"
    );

  const mimeType=
    String(
      attachment.mimeType||
      "application/octet-stream"
    );

  const data=
    String(
      attachment.data||""
    );

  if(!data){

    return null;

  }

  return {
    name,
    mimeType,
    data
  };

}


function isTextFile(
  mimeType,
  name
){

  const mime=
    String(mimeType)
      .toLowerCase();

  const filename=
    String(name)
      .toLowerCase();

  return (
    mime.startsWith("text/") ||
    mime.includes("json") ||
    mime.includes("csv") ||
    mime.includes("markdown") ||
    /\.(txt|csv|json|md)$/i.test(
      filename
    )
  );

}


function buildAttachmentPart(
  attachment
){

  if(
    isTextFile(
      attachment.mimeType,
      attachment.name
    )
  ){

    let decoded="";

    try{

      decoded=
        Buffer
          .from(
            attachment.data,
            "base64"
          )
          .toString("utf8");

    }catch{

      decoded=
        "[Não foi possível ler o arquivo como texto.]";

    }

    return {

      text:
        `Arquivo anexado: ${attachment.name}\n\n${decoded.slice(0,120000)}`

    };

  }

  return {

    inline_data:{

      mime_type:
        attachment.mimeType,

      data:
        attachment.data

    }

  };

}


app.get(
  "/api/health",
  (_req,res)=>{

    res.json({

      ok:true,

      name:"Hermes",

      version:"3.0.0",

      ai:
        Boolean(
          GEMINI_API_KEY
        ),

      model:MODEL,

      imageModel:IMAGE_MODEL,

      provider:"gemini"

    });

  }
);


app.post(
  "/api/chat",
  async(req,res)=>{

    const message=
      String(
        req.body?.message||""
      ).trim();

    const now=
      String(
        req.body?.now||
        new Date()
          .toISOString()
      );

    const timezone=
      String(
        req.body?.timezone||
        "America/Sao_Paulo"
      );


    const memories=
      Array.isArray(
        req.body?.memories
      )
        ?req.body.memories
          .slice(0,50)
        :[];


    const reminders=
      Array.isArray(
        req.body?.reminders
      )
        ?req.body.reminders
          .slice(0,50)
        :[];


    const history=
      safeHistory(
        req.body?.history
      );


    const attachment=
      normalizeAttachment(
        req.body?.attachment
      );


    if(
      !message &&
      !attachment
    ){

      return res
        .status(400)
        .json({
          error:
            "Mensagem vazia."
        });

    }


    if(
      !GEMINI_API_KEY
    ){

      return res
        .status(500)
        .json({
          error:
            "GEMINI_API_KEY não configurada no Vercel."
        });

    }


    const context={

      now,

      timezone,

      memories,

      reminders

    };


    const system=`

Você é Hermes, um assistente pessoal inteligente em português do Brasil.

Seja natural, útil, direto, humano e amigável.

Data e hora atual:
${now}

Fuso horário:
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

Quando houver uma foto:
Analise a imagem com atenção.
Descreva o que for relevante para a pergunta.
Se o usuário pedir leitura de texto, faça OCR.
Se pedir análise, explique.
Se pedir uma alteração visual, a interface possui uma função específica de edição.

Quando houver um arquivo:
Analise o conteúdo disponível.
Para PDF, considere texto, tabelas, gráficos e imagens quando disponíveis.
Para TXT, CSV, JSON e Markdown, leia o conteúdo.
Não invente informações que não estejam no arquivo.

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


    const contents=[

      ...history,

      {

        role:"user",

        parts:[]

      }

    ];


    const currentParts=
      contents[
        contents.length-1
      ].parts;


    if(message){

      currentParts.push({
        text:message
      });

    }


    if(attachment){

      currentParts.push(
        buildAttachmentPart(
          attachment
        )
      );

    }


    try{

      const response=
        await fetch(

          `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,

          {

            method:"POST",

            headers:{

              "Content-Type":
                "application/json",

              "x-goog-api-key":
                GEMINI_API_KEY

            },

            body:
              JSON.stringify({

                systemInstruction:{

                  parts:[
                    {
                      text:system
                    }
                  ]

                },

                contents,

                generationConfig:{

                  responseMimeType:
                    "application/json",

                  responseJsonSchema:
                    HERMES_SCHEMA,

                  maxOutputTokens:700

                }

              })

          }

        );


      const raw=
        await response.text();


      if(!response.ok){

        console.error(
          "Gemini API error:",
          raw
        );

        let details=raw;

        try{

          const parsed=
            JSON.parse(raw);

          details=
            parsed?.error?.message||
            parsed?.error?.status||
            raw;

        }catch{}

        return res
          .status(502)
          .json({

            error:
              `Gemini: ${details}`

          });

      }


      const payload=
        JSON.parse(raw);


      const text=
        extractText(
          payload
        );


      if(!text){

        return res
          .status(502)
          .json({

            error:
              "Gemini não retornou uma resposta."

          });

      }


      let data;

      try{

        data=
          JSON.parse(text);

      }catch{

        data={

          reply:text,

          action:"none",

          reminder_title:"",

          reminder_when:"",

          reminder_repeat:"one_time",

          memory_key:"",

          memory_value:""

        };

      }


      return res.json({

        ...data,

        ai:true,

        model:MODEL,

        provider:"gemini",

        attachment:
          Boolean(attachment)

      });


    }catch(error){

      console.error(
        "Hermes Gemini error:",
        error
      );

      return res
        .status(502)
        .json({

          error:
            error?.message||
            "Erro ao chamar o Gemini."

        });

    }

  }
);


app.post(
  "/api/image-edit",
  async(req,res)=>{

    if(
      !GEMINI_API_KEY
    ){

      return res
        .status(500)
        .json({

          error:
            "GEMINI_API_KEY não configurada."

        });

    }


    const prompt=
      String(
        req.body?.prompt||
        ""
      ).trim();


    const image=
      req.body?.image;


    if(
      !prompt ||
      !image?.data
    ){

      return res
        .status(400)
        .json({

          error:
            "Envie uma imagem e descreva a alteração desejada."

        });

    }


    try{

      const response=
        await fetch(

          `https://generativelanguage.googleapis.com/v1/models/${IMAGE_MODEL}:generateContent`,

          {

            method:"POST",

            headers:{

              "Content-Type":
                "application/json",

              "x-goog-api-key":
                GEMINI_API_KEY

            },

            body:
              JSON.stringify({

                contents:[

                  {

                    parts:[

                      {

                        text:
                          `
Edite a imagem enviada seguindo exatamente a instrução abaixo.

Instrução do usuário:
${prompt}

Preserve a identidade, características principais e elementos não solicitados da imagem sempre que possível.

Faça a edição de forma natural e realista.
`

                      },

                      {

                        inline_data:{

                          mime_type:
                            image.mimeType||
                            "image/jpeg",

                          data:
                            image.data

                        }

                      }

                    ]

                  }

                ],

                generationConfig:{

                  responseModalities:[
                    "TEXT",
                    "IMAGE"
                  ],

                  responseFormat:{

                    image:{

                      imageSize:
                        "1K"

                    }

                  }

                }

              })

          }

        );


      const raw=
        await response.text();


      if(!response.ok){

        console.error(
          "Gemini Image error:",
          raw
        );

        let details=raw;

        try{

          const parsed=
            JSON.parse(raw);

          details=
            parsed?.error?.message||
            parsed?.error?.status||
            raw;

        }catch{}

        return res
          .status(502)
          .json({

            error:
              `Gemini Image: ${details}`

          });

      }


      const payload=
        JSON.parse(raw);


      const imageResult=
        extractImage(
          payload
        );


      const text=
        extractText(
          payload
        );


      if(!imageResult){

        return res
          .status(502)
          .json({

            error:
              text||
              "O Gemini não retornou uma imagem."

          });

      }


      return res.json({

        ok:true,

        image:
          imageResult.data,

        mimeType:
          imageResult.mimeType,

        reply:
          text||
          "Pronto! Editei a imagem. 🎨"

      });


    }catch(error){

      console.error(
        "Hermes image edit error:",
        error
      );

      return res
        .status(502)
        .json({

          error:
            error?.message||
            "Erro ao editar a imagem."

        });

    }

  }
);


app.get(
  "*splat",
  (_req,res)=>{

    res.sendFile(
      path.join(
        __dirname,
        "index.html"
      )
    );

  }
);


app.listen(
  PORT,
  ()=>{

    console.log(
      `Hermes 3.0 com anexos rodando na porta ${PORT}`
    );

  }
);
