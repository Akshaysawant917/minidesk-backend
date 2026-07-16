import { Router } from "express";
import prisma from "../prismaClient.js";
import authMiddleware from "../middleware/auth.middleware.js";

const router = Router();

/**
 * Create a command
 */
router.post("/", authMiddleware, async (req, res) => {
  const { command } = req.body;
  const userId = req.user.userId;

  if (!command) {
    return res.status(400).json({ error: "Command is required" });
  }

  const newCommand = await prisma.command.create({
    data: {
      command,
      userId,
    },
  });

  res.json(newCommand);
});

/**
 * List commands with cursor pagination (default 30)
 */
router.get("/", authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const limit = parseInt(req.query.limit, 10) || 30;
  const cursor = req.query.cursor;

  const commands = await prisma.command.findMany({
    where: { userId },
    orderBy: [
      { createdAt: "desc" },
      { id: "desc" },
    ],
    take: limit + 1,
    ...(cursor && {
      skip: 1,
      cursor: { id: cursor },
    }),
  });

  const hasMore = commands.length > limit;
  const items = hasMore ? commands.slice(0, limit) : commands;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  res.json({
    items,
    nextCursor,
    hasMore,
  });
});

/**
 * Delete a command
 */
router.delete("/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;

  const deleted = await prisma.command.deleteMany({
    where: {
      id,
      userId, // ownership check
    },
  });

  if (deleted.count === 0) {
    return res.status(404).json({ error: "Command not found" });
  }

  res.json({ message: "Command deleted" });
});

export default router;
