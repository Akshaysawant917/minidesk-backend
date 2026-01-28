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

  const notes = await prisma.note.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });

  res.json(notes);
});

/**
 * Update a note
 */
router.patch("/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { title, content } = req.body;
  const userId = req.user.userId;

  const updated = await prisma.note.updateMany({
    where: {
      id,
      userId, // ensures ownership
    },
    data: {
      title,
      content,
    },
  });

  if (updated.count === 0) {
    return res.status(404).json({ error: "Note not found" });
  }

  res.json({ message: "Note updated" });
});

export default router;
