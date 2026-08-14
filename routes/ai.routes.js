import { Router } from "express";
import OpenAI from "openai";
import prisma from "../prismaClient.js";
import authMiddleware from "../middleware/auth.middleware.js";

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

const tools = [
  {
    type: "function",
    name: "getWorkLogs",
    description: "Get the authenticated user's work logs for a natural date range like this_week, last_7_days, or this_month.",
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
    description: "Get the authenticated user's todos with optional filters for completion, status, and tag.",
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
    description: "Search the authenticated user's notes by a query string in title or content.",
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

router.post("/chat", authMiddleware, async (req, res) => {
  const { message } = req.body;
  const userId = req.user.userId;

  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: "Message is required" });
  }

  try {
    const userMessage = String(message).trim();
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
