import { Router } from "express";
import prisma from "../prismaClient.js";
import authMiddleware from "../middleware/auth.middleware.js";

const router = Router();

/**
 * Dashboard summary
 * - Today's pending todos (preview + count)
 * - Latest notes (preview + total count)
 * - Work logs (current month only)
 */
router.get("/summary", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    // 🗓️ Current month range
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [
      todayTodos,
      todayTodoCount,

      notes,
      notesCount,

      workLogs,
      workLogsCount,
    ] = await Promise.all([
      /* ---------- Todos (Today only) ---------- */
      prisma.todo.findMany({
        where: {
          userId,
          status: "high",
          completed: false,
        },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          content: true,
        },
      }),

      prisma.todo.count({
        where: {
          userId,
          status: "high",
          completed: false,
        },
      }),

      /* ---------- Notes ---------- */
      prisma.note.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        take: 3,
        select: {
          id: true,
          title: true,
          content: true,
        },
      }),

      prisma.note.count({
        where: { userId },
      }),

      /* ---------- Work Logs (Current Month ONLY) ---------- */
      prisma.workLog.findMany({
        where: {
          userId,
          date: {
            gte: startOfMonth,
            lt: startOfNextMonth,
          },
        },
        orderBy: { date: "desc" },
        take: 3,
        select: {
          id: true,
          date: true,
          content: true,
        },
      }),

      prisma.workLog.count({
        where: {
          userId,
          date: {
            gte: startOfMonth,
            lt: startOfNextMonth,
          },
        },
      }),
    ]);

    res.json({
      todos: {
        todayCount: todayTodoCount,
        todayItems: todayTodos,
      },
      notes: {
        count: notesCount,
        latest: notes,
      },
      workLogs: {
        count: workLogsCount, // ✅ current month only
        latest: workLogs,
      },
    });
  } catch (err) {
    console.error("Dashboard summary error:", err);
    res.status(500).json({ error: "Failed to load dashboard summary" });
  }
});

export default router;
