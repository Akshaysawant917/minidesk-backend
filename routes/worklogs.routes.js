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
 * List my work logs
 */
router.get("/", authMiddleware, async (req, res) => {
  const userId = req.user.userId;

  const logs = await prisma.workLog.findMany({
    where: { userId },
    orderBy: { date: "desc" },
  });

  res.json(logs);
});

/**
 * Update a work log (edit)
 */
router.patch("/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;
  const userId = req.user.userId;

  if (!content) {
    return res.status(400).json({ error: "Content is required" });
  }

  const result = await prisma.workLog.updateMany({
    where: {
      id,
      userId, // ensures user owns the log
    },
    data: {
      content,
    },
  });

  if (result.count === 0) {
    return res.status(404).json({
      error: "Work log not found",
    });
  }

  res.json({ message: "Work log updated" });
});


export default router;

