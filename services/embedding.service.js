import OpenAI from "openai";
import prisma from "../prismaClient.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
const EMBEDDING_DIMENSION = Number(process.env.OPENAI_EMBEDDING_DIMENSIONS || 1536);

function normalizeVector(value) {
  if (!Array.isArray(value)) {
    throw new Error("Embedding response is not an array");
  }

  if (!value.length) {
    throw new Error("Embedding response is empty");
  }

  return `[${value.map((v) => Number(v)).join(",")}]`;
}

export async function generateEmbedding(text) {
  const input = String(text ?? "").trim();

  if (!input) {
    throw new Error("Embedding text is required");
  }

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input,
  });

  const vector = response?.data?.[0]?.embedding;

  if (!vector) {
    throw new Error("Embedding generation returned no vector");
  }

  return normalizeVector(vector);
}

export async function generateEmbeddingArray(text) {
  const input = String(text ?? "").trim();

  if (!input) {
    throw new Error("Embedding text is required");
  }

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input,
  });

  const vector = response?.data?.[0]?.embedding;

  if (!vector) {
    throw new Error("Embedding generation returned no vector");
  }

  return vector;
}

export function getNoteEmbeddingText(note) {
  const rawTitle = note?.title ?? "";
  const rawContent = note?.content ?? "";
  const title = String(rawTitle).trim();
  const content = String(rawContent).trim();

  if (title && content) {
    return `${title}\n${content}`;
  }

  return title || content;
}

export function getWorkLogEmbeddingText(workLog) {
  const rawContent = workLog?.content ?? "";
  return String(rawContent).trim();
}

export function shouldRegenerateNoteEmbedding(previousNote, nextNote) {
  if (!previousNote || !nextNote) {
    return false;
  }

  const prevText = getNoteEmbeddingText(previousNote);
  const nextText = getNoteEmbeddingText(nextNote);

  return prevText !== nextText;
}

export function shouldRegenerateWorkLogEmbedding(previousWorkLog, nextWorkLog) {
  if (!previousWorkLog || !nextWorkLog) {
    return false;
  }

  return getWorkLogEmbeddingText(previousWorkLog) !== getWorkLogEmbeddingText(nextWorkLog);
}

export async function updateNoteEmbeddingById(noteId, nextText) {
  const text = String(nextText ?? "").trim();

  if (!text) {
    return null;
  }

  const embedding = await generateEmbedding(text);

  return prisma.note.update({
    where: { id: noteId },
    data: {
      embedding: `[{${Array.from({ length: EMBEDDING_DIMENSION }, () => 0).join(",")}}]`,
    },
  });
}

export async function generateAndStoreNoteEmbedding(noteId) {
  const note = await prisma.note.findUnique({
    where: { id: noteId },
  });

  if (!note) {
    throw new Error("Note not found");
  }

  const text = getNoteEmbeddingText(note);

  if (!text) {
    return null;
  }

  const embedding = await generateEmbedding(text);

  return prisma.note.update({
    where: { id: noteId },
    data: {
      embedding,
    },
  });
}

export async function generateAndStoreWorkLogEmbedding(workLogId) {
  const workLog = await prisma.workLog.findUnique({
    where: { id: workLogId },
  });

  if (!workLog) {
    throw new Error("Work log not found");
  }

  const text = getWorkLogEmbeddingText(workLog);

  if (!text) {
    return null;
  }

  const embedding = await generateEmbedding(text);

  return prisma.workLog.update({
    where: { id: workLogId },
    data: {
      embedding,
    },
  });
}

export async function backfillEmbeddingsForNotes(batchSize = 20) {
  const notes = await prisma.$queryRawUnsafe(`
    SELECT id, title, content, "updatedAt"
    FROM "Note"
    WHERE "embedding" IS NULL
    ORDER BY "updatedAt" ASC
    LIMIT ${batchSize}
  `);

  const results = [];

  for (const note of notes) {
    try {
      const text = getNoteEmbeddingText(note);
      if (!text) {
        continue;
      }

      const embedding = await generateEmbedding(text);
      await prisma.$executeRawUnsafe(
        `UPDATE "Note" SET "embedding" = $1::vector WHERE id = $2`,
        embedding,
        note.id
      );
      results.push(note.id);
    } catch (error) {
      console.error(`Failed to backfill note embedding for ${note.id}:`, error.message || error);
    }
  }

  return results;
}

export async function backfillEmbeddingsForWorkLogs(batchSize = 20) {
  const logs = await prisma.$queryRawUnsafe(`
    SELECT id, content, "createdAt"
    FROM "WorkLog"
    WHERE "embedding" IS NULL
    ORDER BY "createdAt" ASC
    LIMIT ${batchSize}
  `);

  const results = [];

  for (const workLog of logs) {
    try {
      const text = getWorkLogEmbeddingText(workLog);
      if (!text) {
        continue;
      }

      const embedding = await generateEmbedding(text);
      await prisma.$executeRawUnsafe(
        `UPDATE "WorkLog" SET "embedding" = $1::vector WHERE id = $2`,
        embedding,
        workLog.id
      );
      results.push(workLog.id);
    } catch (error) {
      console.error(`Failed to backfill work log embedding for ${workLog.id}:`, error.message || error);
    }
  }

  return results;
}

export async function searchNotesByEmbedding(userId, query, limit = 10) {
  const text = String(query || "").trim();

  if (!text) {
    return [];
  }

  const embedding = await generateEmbeddingArray(text);
  const vectorLiteral = `[${embedding.join(",")}]`;

  const rows = await prisma.$queryRawUnsafe(
    `
      SELECT n.id,
             n.title,
             n.content,
             n."folderId",
             n."createdAt",
             n."updatedAt",
             1 - (n.embedding <=> $1::vector) AS score
      FROM "Note" n
      WHERE n."userId" = $2
        AND n.embedding IS NOT NULL
      ORDER BY n.embedding <=> $1::vector
      LIMIT $3
    `,
    vectorLiteral,
    userId,
    limit
  );

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    content: row.content,
    folderId: row.folderId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    score: Number(row.score),
  }));
}

export async function searchWorkLogsByEmbedding(userId, query, limit = 10) {
  const text = String(query || "").trim();

  if (!text) {
    return [];
  }

  const embedding = await generateEmbeddingArray(text);
  const vectorLiteral = `[${embedding.join(",")}]`;

  const rows = await prisma.$queryRawUnsafe(
    `
      SELECT w.id,
             w.content,
             w.date,
             w."createdAt",
             1 - (w.embedding <=> $1::vector) AS score
      FROM "WorkLog" w
      WHERE w."userId" = $2
        AND w.embedding IS NOT NULL
      ORDER BY w.embedding <=> $1::vector
      LIMIT $3
    `,
    vectorLiteral,
    userId,
    limit
  );

  return rows.map((row) => ({
    id: row.id,
    content: row.content,
    date: row.date,
    createdAt: row.createdAt,
    score: Number(row.score),
  }));
}

export const EMBEDDING_MODEL_NAME = EMBEDDING_MODEL;
export const EMBEDDING_DIMENSIONS = EMBEDDING_DIMENSION;
