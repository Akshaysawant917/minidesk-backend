import { Router } from "express";
import prisma from "../prismaClient.js";
import authMiddleware from "../middleware/auth.middleware.js";

const router = Router();

/**
 * Create a todo
 */
router.post("/", authMiddleware, async (req, res) => {
  const { content, status } = req.body; 
  const userId = req.user.userId;

  if (!content) {
    return res.status(400).json({ error: "Content is required" });
  }

  if (status !== "TODAY" && status !== "LATER") {
    return res.status(400).json({ error: "Invalid status" });
  }

  const todo = await prisma.todo.create({
    data: {
      content,
      status,
      userId,
    },
  });

  res.json(todo);
});

/**
 * List my todos
 */
router.get("/", authMiddleware, async (req, res) => {
  const userId = req.user.userId;

  const todos = await prisma.todo.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  res.json({
    today: todos.filter((t) => t.status === "TODAY"),
    later: todos.filter((t) => t.status === "LATER"),
  });
});

/**
 * Move todo (TODAY ↔ LATER)
 */
router.patch("/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const userId = req.user.userId;

  if (status !== "TODAY" && status !== "LATER") {
    return res.status(400).json({ error: "Invalid status" });
  }

  const todo = await prisma.todo.updateMany({
    where: {
      id,
      userId, // ensures ownership
    },
    data: { status },
  });

  if (todo.count === 0) {
    return res.status(404).json({ error: "Todo not found" });
  }

  res.json({ message: "Todo updated" });
});

export default router;
