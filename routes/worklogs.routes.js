import { Router } from "express";
import prisma from "../prismaClient.js";
import authMiddleware from "../middleware/auth.middleware.js";

const router = Router();

/**
 * Create today's work log
 */
router.post("/", authMiddleware, async (req, res) => {
  const { content } = req.body;
  const userId = req.user.userId;

  if (!content) {
    return res.status(400).json({ error: "Content is required" });
  }

  // normalize date to start of day
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const existingLog = await prisma.workLog.findFirst({
    where: {
      userId,
      date: today,
    },
  });

  if (existingLog) {
    return res.status(409).json({
      error: "Work log for today already exists",
    });
  }

  const log = await prisma.workLog.create({
    data: {
      content,
      date: today,
      userId,
    },
  });

  res.json(log);
});

/**
 * List my work logs (paginated)
 */
router.get("/", authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const limit = parseInt(req.query.limit) || 10;
  const cursor = req.query.cursor; // workLog.id

  const logs = await prisma.workLog.findMany({
    where: { userId },
    orderBy: [
      { date: "desc" },
      { id: "desc" },
    ],
    take: limit + 1,
    ...(cursor && {
      skip: 1,
      cursor: { id: cursor },
    }),
  });

  const hasMore = logs.length > limit;
  const items = hasMore ? logs.slice(0, limit) : logs;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  res.json({
    items,
    nextCursor,
    hasMore,
  });
});


/**
 * Update a work log
 */
router.patch("/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;
  const userId = req.user.userId;

  if (!content) {
    return res.status(400).json({ error: "Content is required" });
  }

  const log = await prisma.workLog.findFirst({
    where: { id, userId },
  });

  if (!log) {
    return res.status(404).json({ error: "Work log not found" });
  }

  const updated = await prisma.workLog.update({
    where: { id },
    data: { content },
  });

  res.json(updated);
});


export default router;

