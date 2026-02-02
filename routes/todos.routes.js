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


router.get("/completed", authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const limit = parseInt(req.query.limit) || 10;
  const cursor = req.query.cursor; // this will be todo.id

  const completedTodos = await prisma.todo.findMany({
    where: {
      userId,
      completed: true,
    },
    orderBy: [
      { updatedAt: "desc" },
      { id: "desc" }, // secondary sort for stability
    ],
    take: limit + 1,
    ...(cursor && {
      skip: 1,
      cursor: { id: cursor }, // ✅ UNIQUE FIELD
    }),
  });

  const hasMore = completedTodos.length > limit;
  const items = hasMore
    ? completedTodos.slice(0, limit)
    : completedTodos;

  const nextCursor = hasMore
    ? items[items.length - 1].id
    : null;

  res.json({
    items,
    nextCursor,
    hasMore,
  });
});



router.get("/", authMiddleware, async (req, res) => {
  const userId = req.user.userId;

  const todos = await prisma.todo.findMany({
    where: {
      userId,
      completed: false, // ✅ IMPORTANT
    },
    orderBy: { createdAt: "desc" },
  });

  res.json({
    today: todos.filter((t) => t.status === "TODAY"),
    later: todos.filter((t) => t.status === "LATER"),
  });
});


/**
 * Update todo (status and/or completed)
 */
router.patch("/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { status, completed } = req.body;
  const userId = req.user.userId;

  const data = {};

  // ✅ Validate & update status ONLY if provided
  if (status !== undefined) {
    if (status !== "TODAY" && status !== "LATER") {
      return res.status(400).json({ error: "Invalid status" });
    }
    data.status = status;
  }

  // ✅ Update completed ONLY if provided
  if (typeof completed === "boolean") {
    data.completed = completed;
  }

  // 🚫 Nothing valid to update
  if (Object.keys(data).length === 0) {
    return res
      .status(400)
      .json({ error: "No valid fields to update" });
  }

  const result = await prisma.todo.updateMany({
    where: {
      id,
      userId, // ownership check
    },
    data,
  });

  if (result.count === 0) {
    return res.status(404).json({ error: "Todo not found" });
  }

  res.json({ message: "Todo updated" });
});


export default router;
