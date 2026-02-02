import { Router } from "express";
import prisma from "../prismaClient.js";
import authMiddleware from "../middleware/auth.middleware.js";

const router = Router();

/**
 * Create a note
 */
router.post("/", authMiddleware, async (req, res) => {
  const { title, content } = req.body;
  const userId = req.user.userId;

  if (!content) {
    return res.status(400).json({ error: "Content is required" });
  }

  const note = await prisma.note.create({
    data: {
      title,
      content,
      userId,
    },
  });

  res.json(note);
});

/**
 * List my notes
 */
router.get("/", authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const limit = parseInt(req.query.limit) || 10;
  const cursor = req.query.cursor; // note.id

  const notes = await prisma.note.findMany({
    where: { userId },
    orderBy: [
      { updatedAt: "desc" },
      { id: "desc" },
    ],
    take: limit + 1,
    ...(cursor && {
      skip: 1,
      cursor: { id: cursor },
    }),
  });

  const hasMore = notes.length > limit;
  const items = hasMore ? notes.slice(0, limit) : notes;

  const nextCursor = hasMore
    ? items[items.length - 1].id
    : null;

  res.json({
    items,
    nextCursor,
    hasMore,
  });
});

/**
 * Update a note
 */
router.patch("/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { title, content } = req.body;
  const userId = req.user.userId;

  // 1️⃣ Ensure note exists & belongs to user
  const note = await prisma.note.findFirst({
    where: {
      id,
      userId,
    },
  });

  if (!note) {
    return res.status(404).json({ error: "Note not found" });
  }

  // 2️⃣ Update and RETURN the updated note
  const updatedNote = await prisma.note.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(content !== undefined && { content }),
    },
  });

  res.json(updatedNote);
});


/**
 * Delete a note
 */
router.delete("/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;

  const deleted = await prisma.note.deleteMany({
    where: {
      id,
      userId, // ownership check
    },
  });

  if (deleted.count === 0) {
    return res.status(404).json({ error: "Note not found" });
  }

  res.json({ message: "Note deleted" });
});


export default router;
