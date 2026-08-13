import { Router } from "express";
import prisma from "../prismaClient.js";
import authMiddleware from "../middleware/auth.middleware.js";

const router = Router();

/**
 * Create a note
 */
router.post("/", authMiddleware, async (req, res) => {
  const { title, content, folderId } = req.body;
  const userId = req.user.userId;

  if (!content) {
    return res.status(400).json({ error: "Content is required" });
  }

  // if folderId provided, ensure it belongs to the user
  if (folderId) {
    const folder = await prisma.folder.findFirst({ where: { id: folderId, userId } });
    if (!folder) return res.status(400).json({ error: "Invalid folderId" });
  }

  const note = await prisma.note.create({ data: { title, content, userId, ...(folderId && { folderId }) } });

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
  const { title, content, folderId } = req.body;
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
  const data = {};
  if (title !== undefined) data.title = title;
  if (content !== undefined) data.content = content;
  if (folderId !== undefined) {
    if (folderId === null) {
      data.folderId = null;
    } else {
      const folder = await prisma.folder.findFirst({ where: { id: folderId, userId } });
      if (!folder) return res.status(400).json({ error: "Invalid folderId" });
      data.folderId = folderId;
    }
  }

  const updatedNote = await prisma.note.update({ where: { id }, data });

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
