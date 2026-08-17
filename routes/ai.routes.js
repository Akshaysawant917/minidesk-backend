import { Router } from "express";
import OpenAI from "openai";
import prisma from "../prismaClient.js";
import authMiddleware from "../middleware/auth.middleware.js";
import {
  generateAndStoreNoteEmbedding,
  generateAndStoreWorkLogEmbedding,
  searchNotesByEmbedding,
  searchWorkLogsByEmbedding,
} from "../services/embedding.service.js";

const router = Router();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const validRanges = [
  "today",
  "yesterday",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "last_7_days",
  "last_30_days",
];

const OUT_OF_SCOPE_RESPONSE =
  "I can help with MiniDesk tasks, notes, worklogs, todos, jobs, and your stored data. I can't help with unrelated general questions.";

async function isMiniDeskRequest(message) {
  const text = String(message ?? "").trim();

  if (!text) {
    return false;
  }

  const classifierModel = process.env.OPENAI_SCOPE_CLASSIFIER_MODEL || "gpt-5-mini";

  const response = await openai.responses.create({
    model: classifierModel,
    input: [
      {
        role: "system",
        content:
          "You are a scope classifier for MiniDesk. Return only JSON with a boolean field named isMiniDeskRelated. MiniDesk is a personal productivity app for notes, worklogs, todos, bookmarks, job tracker, commands, and stored user data. Return true when the user request could reasonably be answered using MiniDesk functionality or the user's MiniDesk data, even if the request does not explicitly mention MiniDesk, notes, worklogs, or tasks. Return false for clearly unrelated general knowledge, content generation, current external information, or anything that cannot reasonably be answered using MiniDesk. Do not answer the user's question. Only classify scope.",
      },
      {
        role: "user",
        content: text,
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "mini_desk_scope_check",
        schema: {
          type: "object",
          properties: {
            isMiniDeskRelated: { type: "boolean" },
          },
          required: ["isMiniDeskRelated"],
          additionalProperties: false,
        },
      },
    },
  });

  let parsed = response?.output_parsed ?? {};

  if (!parsed || typeof parsed !== "object" || !Object.keys(parsed).length) {
    try {
      parsed = JSON.parse(response?.output_text || "{}") || {};
    } catch (error) {
      parsed = {};
    }
  }

  const isMiniDeskRelated = Boolean(parsed.isMiniDeskRelated);

  console.log(`[SCOPE] message: ${text}`);
  console.log(`[SCOPE] result: ${isMiniDeskRelated ? "MINIDESK_RELATED" : "OUT_OF_SCOPE"}`);

  return isMiniDeskRelated;
}

const tools = [
  {
    type: "function",
    name: "getWorkLogs",
    description: "Get the authenticated user's MiniDesk work logs for a date range. This only reads the current user's stored work history and never touches unrelated data.",
    parameters: {
      type: "object",
      properties: {
        range: {
          type: "string",
          enum: validRanges,
          description: "The date range to fetch work logs for.",
        },
        startDate: {
          type: ["string", "null"],
          description: "Optional exact start date in YYYY-MM-DD format for custom ranges.",
        },
        endDate: {
          type: ["string", "null"],
          description: "Optional exact end date in YYYY-MM-DD format for custom ranges.",
        },
      },
      required: ["range", "startDate", "endDate"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "getTodos",
    description: "Read the authenticated user's MiniDesk todos and tasks with optional filters for completion, status, and tag. Use only for the current user's MiniDesk task data.",
    parameters: {
      type: "object",
      properties: {
        completed: {
          type: ["boolean", "null"],
          description: "Whether the todo is completed. Use true for completed, false for pending, null for all.",
        },
        status: {
          type: ["string", "null"],
          enum: ["high", "medium", "low", null],
          description: "Priority level filter for todos.",
        },
        tag: {
          type: ["string", "null"],
          description: "Optional tag to filter todos by. Use null if tag filter is not needed.",
        },
      },
      required: ["completed", "status", "tag"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "searchNotes",
    description: "Search the authenticated user's MiniDesk notes by query text in title or content. Use this only when the request is about the user's stored notes.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search text to look for in the user's notes.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "searchNotesSemantic",
    description: "Search the authenticated user's MiniDesk notes for information that may answer the user's request. Use this when the request could reasonably refer to information stored in the user's notes, even if the user does not explicitly say 'my notes'. Never search data belonging to another user.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Natural-language query to match semantically against the user's note embeddings.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "searchWorkLogsSemantic",
    description: "Search the authenticated user's MiniDesk worklogs for information that may answer the user's request. Use this when the request could reasonably refer to work the user previously recorded, even if the user does not explicitly say 'my worklogs'. Never search data belonging to another user.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Natural-language query to match semantically against the user's work log embeddings.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "createNote",
    description: "Create a MiniDesk note for the authenticated user. This tool only creates a note in the current user's MiniDesk account and never accepts an ownership override.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: ["string", "null"],
          description: "Optional note title. Use null if no title is needed.",
        },
        content: {
          type: "string",
          description: "The note body. Use a short, clear note. If the user provided multiple bullet points, format them as lines starting with '- '.",
        },
        folderId: {
          type: ["string", "null"],
          description: "Optional folder ID for the note. Must belong to the authenticated user.",
        },
      },
      required: ["title", "content", "folderId"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "createTodo",
    description: "Create a MiniDesk todo/task for the authenticated user using the current user's task data. The backend enforces ownership and validation.",
    parameters: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The todo item text. If the user gave multiple tasks, format each point with '- ' before each line.",
        },
        status: {
          type: "string",
          enum: ["high", "medium", "low"],
          description: "Todo priority/status. Must be one of high, medium, or low.",
        },
        tag: {
          type: ["string", "null"],
          description: "Optional tag. Use null if no tag is needed.",
        },
      },
      required: ["content", "status", "tag"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "createWorklog",
    description: "Create a MiniDesk work log for the authenticated user. Use today's date by default if no date is provided and store it under the current user's account only.",
    parameters: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The work log content. If the user provided multiple items, format each bullet with '- ' before each line.",
        },
        date: {
          type: ["string", "null"],
          description: "Optional work log date in YYYY-MM-DD format. If omitted, today's date is used.",
        },
      },
      required: ["content", "date"],
      additionalProperties: false,
    },
    strict: true,
  },
];

function toStartOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function getWeekStart(date) {
  const d = toStartOfDay(date);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return d;
}

function resolveDateRange(range, startDate, endDate) {
  const today = toStartOfDay(new Date());

  if (range === "today") {
    return {
      startDate: today,
      endDate: addDays(today, 1),
    };
  }

  if (range === "yesterday") {
    const start = addDays(today, -1);
    return {
      startDate: start,
      endDate: today,
    };
  }

  if (range === "this_week") {
    const start = getWeekStart(today);
    return {
      startDate: start,
      endDate: addDays(start, 7),
    };
  }

  if (range === "last_week") {
    const thisWeekStart = getWeekStart(today);
    const lastWeekStart = addDays(thisWeekStart, -7);
    return {
      startDate: lastWeekStart,
      endDate: addDays(lastWeekStart, 7),
    };
  }

  if (range === "this_month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    return { startDate: start, endDate: end };
  }

  if (range === "last_month") {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const end = new Date(today.getFullYear(), today.getMonth(), 1);
    return { startDate: start, endDate: end };
  }

  if (range === "last_7_days") {
    return {
      startDate: addDays(today, -6),
      endDate: addDays(today, 1),
    };
  }

  if (range === "last_30_days") {
    return {
      startDate: addDays(today, -29),
      endDate: addDays(today, 1),
    };
  }

  if (startDate && endDate) {
    return {
      startDate: toStartOfDay(new Date(startDate)),
      endDate: toStartOfDay(new Date(endDate)),
    };
  }

  throw new Error("Invalid work log date range.");
}

async function getWorkLogsForUser(userId, range, startDate, endDate) {
  const { startDate: resolvedStart, endDate: resolvedEnd } = resolveDateRange(range, startDate, endDate);

  const logs = await prisma.workLog.findMany({
    where: {
      userId,
      date: {
        gte: resolvedStart,
        lt: resolvedEnd,
      },
    },
    orderBy: {
      date: "desc",
    },
  });

  return logs.map((log) => ({
    id: log.id,
    date: new Date(log.date).toISOString().slice(0, 10),
    content: log.content,
  }));
}

async function getTodosForUser(userId, completed = null, status = null, tag = null) {
  const todos = await prisma.todo.findMany({
    where: {
      userId,
      ...(completed !== null ? { completed } : {}),
      ...(status ? { status } : {}),
      ...(tag ? { tag } : {}),
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  return todos.map((todo) => ({
    id: todo.id,
    content: todo.content,
    status: todo.status,
    completed: todo.completed,
    tag: todo.tag,
    createdAt: todo.createdAt,
    updatedAt: todo.updatedAt,
  }));
}

async function searchNotesForUser(userId, query) {
  const safeQuery = String(query || "").trim();

  if (!safeQuery) {
    return [];
  }

  const notes = await prisma.note.findMany({
    where: {
      userId,
      OR: [
        { title: { contains: safeQuery, mode: "insensitive" } },
        { content: { contains: safeQuery, mode: "insensitive" } },
      ],
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: 20,
  });

  return notes.map((note) => ({
    id: note.id,
    title: note.title,
    content: note.content,
    folderId: note.folderId,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  }));
}

async function createNoteForUser(userId, data = {}) {
  const { title, content, folderId } = data;

  if (!content || !String(content).trim()) {
    throw new Error("Content is required");
  }

  if (folderId) {
    const folder = await prisma.folder.findFirst({
      where: {
        id: folderId,
        userId,
      },
    });

    if (!folder) {
      throw new Error("Invalid folderId");
    }
  }

  return prisma.note.create({
    data: {
      title: title ?? null,
      content: String(content).trim(),
      userId,
      ...(folderId ? { folderId } : {}),
    },
  });
}

async function createTodoForUser(userId, data = {}) {
  const { content, status, tag } = data;

  if (!content || !String(content).trim()) {
    throw new Error("Content is required");
  }

  if (status !== "high" && status !== "medium" && status !== "low") {
    throw new Error("Invalid status. Must be 'high', 'medium', or 'low'");
  }

  return prisma.todo.create({
    data: {
      content: String(content).trim(),
      status,
      ...(tag !== undefined && tag !== null ? { tag: String(tag).trim() } : {}),
      userId,
    },
  });
}

async function createWorklogForUser(userId, data = {}) {
  const { content, date } = data;

  if (!content || !String(content).trim()) {
    throw new Error("Content is required");
  }

  const logDate = date ? new Date(`${String(date)}T00:00:00`) : new Date();

  if (Number.isNaN(logDate.getTime())) {
    throw new Error("Invalid date. Use YYYY-MM-DD format.");
  }

  logDate.setHours(0, 0, 0, 0);

  const existingLog = await prisma.workLog.findFirst({
    where: {
      userId,
      date: logDate,
    },
  });

  if (existingLog) {
    throw new Error("Work log for that date already exists");
  }

  return prisma.workLog.create({
    data: {
      content: String(content).trim(),
      date: logDate,
      userId,
    },
  });
}

router.post("/chat", authMiddleware, async (req, res) => {
  const { message } = req.body;
  const userId = req.user.userId;

  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: "Message is required" });
  }

  const userMessage = String(message).trim();

  try {
    const isMiniDeskRelated = await isMiniDeskRequest(userMessage);

    if (!isMiniDeskRelated) {
      return res.json({
        answer: OUT_OF_SCOPE_RESPONSE,
      });
    }

    let input = [
      {
        role: "user",
        content: userMessage,
      },
    ];

    let response = await openai.responses.create({
      model: "gpt-5.4-nano",
      tools,
      input,
    });

    const toolCalls = response.output.filter((item) => item.type === "function_call");

    if (!toolCalls.length) {
      return res.json({ answer: response.output_text || "No answer returned" });
    }

    input.push(...response.output);

    for (const toolCall of toolCalls) {
      const args = JSON.parse(toolCall.arguments || "{}");

      if (toolCall.name === "getWorkLogs") {
        const workLogs = await getWorkLogsForUser(
          userId,
          args.range,
          args.startDate,
          args.endDate
        );

        input.push({
          type: "function_call_output",
          call_id: toolCall.call_id,
          output: JSON.stringify({
            count: workLogs.length,
            items: workLogs,
          }),
        });
        continue;
      }

      if (toolCall.name === "getTodos") {
        const todos = await getTodosForUser(
          userId,
          args.completed ?? null,
          args.status ?? null,
          args.tag ?? null
        );

        input.push({
          type: "function_call_output",
          call_id: toolCall.call_id,
          output: JSON.stringify({
            count: todos.length,
            items: todos,
          }),
        });
        continue;
      }

      if (toolCall.name === "searchNotes") {
        const notes = await searchNotesForUser(userId, args.query);

        input.push({
          type: "function_call_output",
          call_id: toolCall.call_id,
          output: JSON.stringify({
            count: notes.length,
            items: notes,
          }),
        });
        continue;
      }

      if (toolCall.name === "searchNotesSemantic") {
        const notes = await searchNotesByEmbedding(userId, args.query, args.limit ?? 10);

        input.push({
          type: "function_call_output",
          call_id: toolCall.call_id,
          output: JSON.stringify({
            count: notes.length,
            items: notes,
          }),
        });
        continue;
      }

      if (toolCall.name === "searchWorkLogsSemantic") {
        const logs = await searchWorkLogsByEmbedding(userId, args.query, args.limit ?? 10);

        input.push({
          type: "function_call_output",
          call_id: toolCall.call_id,
          output: JSON.stringify({
            count: logs.length,
            items: logs,
          }),
        });
        continue;
      }

      if (toolCall.name === "createNote") {
        try {
          const note = await createNoteForUser(userId, args);

          try {
            await generateAndStoreNoteEmbedding(note.id);
          } catch (error) {
            console.error("Failed to generate embedding for AI-created note:", error?.message || error);
          }

          input.push({
            type: "function_call_output",
            call_id: toolCall.call_id,
            output: JSON.stringify({
              success: true,
              created: {
                id: note.id,
                title: note.title,
                content: note.content,
                folderId: note.folderId,
                createdAt: note.createdAt,
                updatedAt: note.updatedAt,
              },
            }),
          });
        } catch (error) {
          input.push({
            type: "function_call_output",
            call_id: toolCall.call_id,
            output: JSON.stringify({
              success: false,
              error: error.message || "Failed to create note",
            }),
          });
        }
        continue;
      }

      if (toolCall.name === "createTodo") {
        try {
          const todo = await createTodoForUser(userId, args);

          input.push({
            type: "function_call_output",
            call_id: toolCall.call_id,
            output: JSON.stringify({
              success: true,
              created: {
                id: todo.id,
                content: todo.content,
                status: todo.status,
                tag: todo.tag,
                completed: todo.completed,
                createdAt: todo.createdAt,
                updatedAt: todo.updatedAt,
              },
            }),
          });
        } catch (error) {
          input.push({
            type: "function_call_output",
            call_id: toolCall.call_id,
            output: JSON.stringify({
              success: false,
              error: error.message || "Failed to create todo",
            }),
          });
        }
        continue;
      }

      if (toolCall.name === "createWorklog") {
        try {
          const worklog = await createWorklogForUser(userId, args);

          try {
            await generateAndStoreWorkLogEmbedding(worklog.id);
          } catch (error) {
            console.error("Failed to generate embedding for AI-created work log:", error?.message || error);
          }

          input.push({
            type: "function_call_output",
            call_id: toolCall.call_id,
            output: JSON.stringify({
              success: true,
              created: {
                id: worklog.id,
                content: worklog.content,
                date: new Date(worklog.date).toISOString().slice(0, 10),
                createdAt: worklog.createdAt,
              },
            }),
          });
        } catch (error) {
          input.push({
            type: "function_call_output",
            call_id: toolCall.call_id,
            output: JSON.stringify({
              success: false,
              error: error.message || "Failed to create work log",
            }),
          });
        }
      }
    }

    const finalResponse = await openai.responses.create({
      model: "gpt-5.4-nano",
      tools,
      input,
    });

    return res.json({
      answer: finalResponse.output_text || "No answer returned",
    });
  } catch (error) {
    console.error("AI chat error:", error);
    return res.status(500).json({ error: "Failed to generate AI response" });
  }
});

export default router;
