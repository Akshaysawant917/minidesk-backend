import OpenAI from "openai";
import prisma from "../prismaClient.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const EMBEDDING_MODEL = "text-embedding-3-small";

async function generateEmbedding(text) {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: String(text ?? "").trim(),
  });

  const embedding = response?.data?.[0]?.embedding;

  if (!embedding) {
    throw new Error("No embedding returned from OpenAI");
  }

  return embedding;
}

function getNoteText(note) {
  const title = String(note?.title ?? "").trim();
  const content = String(note?.content ?? "").trim();

  if (title && content) {
    return `${title}\n${content}`;
  }

  return title || content;
}

async function backfillNotes(limit = 20) {
  const notes = await prisma.$queryRawUnsafe(`
    SELECT id, title, content, "updatedAt"
    FROM "Note"
    WHERE "embedding" IS NULL
    ORDER BY "updatedAt" ASC
    LIMIT ${limit}
  `);

  console.log(`Found ${notes.length} notes without embeddings`);

  let processed = 0;

  for (const note of notes) {
    try {
      const text = getNoteText(note);

      if (!text) {
        console.log(`Skipping note ${note.id}: no searchable text`);
        continue;
      }

      const vector = await generateEmbedding(text);

      await prisma.$executeRaw`
        UPDATE "Note"
        SET "embedding" = ${`[` + vector.join(",") + `]`}::vector
        WHERE id = ${note.id}
      `;

      processed += 1;
      console.log(`Updated note embedding ${note.id}`);
    } catch (error) {
      console.error(`Failed to update note ${note.id}:`, error.message || error);
    }
  }

  return { processed, total: notes.length };
}

async function backfillWorkLogs(limit = 20) {
  const workLogs = await prisma.$queryRawUnsafe(`
    SELECT id, content, "createdAt"
    FROM "WorkLog"
    WHERE "embedding" IS NULL
    ORDER BY "createdAt" ASC
    LIMIT ${limit}
  `);

  console.log(`Found ${workLogs.length} work logs without embeddings`);

  let processed = 0;

  for (const workLog of workLogs) {
    try {
      const text = String(workLog.content ?? "").trim();

      if (!text) {
        console.log(`Skipping work log ${workLog.id}: no searchable text`);
        continue;
      }

      const vector = await generateEmbedding(text);

      await prisma.$executeRaw`
        UPDATE "WorkLog"
        SET "embedding" = ${`[` + vector.join(",") + `]`}::vector
        WHERE id = ${workLog.id}
      `;

      processed += 1;
      console.log(`Updated work log embedding ${workLog.id}`);
    } catch (error) {
      console.error(`Failed to update work log ${workLog.id}:`, error.message || error);
    }
  }

  return { processed, total: workLogs.length };
}

async function main() {
  try {
    console.log("Starting embedding backfill...");
    const noteResult = await backfillNotes(50);
    const workLogResult = await backfillWorkLogs(50);

    console.log("Backfill complete:", {
      notes: noteResult,
      workLogs: workLogResult,
    });
  } catch (error) {
    console.error("Embedding backfill failed:", error.message || error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
