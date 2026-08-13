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

// Charts endpoint: GET /charts?range=7d|30d
router.get("/charts", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const range = req.query.range === "30d" ? 30 : 7;

    const today = new Date();
    // normalize to local midnight
    today.setHours(0, 0, 0, 0);

    // build an array of dates (oldest -> newest)
    const dates = [];
    for (let i = range - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      dates.push(new Date(d));
    }

    // For each date, count completed todos where updatedAt falls within that day
    const trendPromises = dates.map((d) => {
      const start = new Date(d);
      const end = new Date(d);
      end.setDate(end.getDate() + 1);
      return prisma.todo.count({
        where: {
          userId,
          completed: true,
          updatedAt: { gte: start, lt: end },
        },
      });
    });

    const trendCounts = await Promise.all(trendPromises);

    const trend = dates.map((d, idx) => ({
      date: d.toISOString().slice(0, 10),
      count: trendCounts[idx],
    }));

    // pending tasks grouped by tag
    const pendingByTag = await prisma.todo.groupBy({
      by: ["tag"],
      where: { userId, completed: false },
      _count: { id: true },
    });

    // normalize tag results (replace null with 'inbox' or 'untagged')
    const pending = pendingByTag.map((p) => ({ tag: p.tag || "untagged", count: p._count.id }));

    res.json({ trend, pendingByTag: pending });
  } catch (err) {
    console.error("Dashboard charts error:", err);
    res.status(500).json({ error: "Failed to load charts" });
  }
});
