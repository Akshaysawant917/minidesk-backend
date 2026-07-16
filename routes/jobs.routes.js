import { Router } from "express";
import prisma from "../prismaClient.js";
import authMiddleware from "../middleware/auth.middleware.js";

const router = Router();
const validStatuses = [
  "applied",
  "interviewing",
  "offer",
  "offer_accepted",
  "offer_rejected",
  "rejected",
];

/**
 * Create a job tracker entry
 */
router.post("/", authMiddleware, async (req, res) => {
  const {
    company,
    role,
    location,
    source,
    status,
    notes,
    salary,
    applicationDate,
    interviewDate,
  } = req.body;
  const userId = req.user.userId;

  if (!company || !role || !location || !source || !status || !notes) {
    return res.status(400).json({
      error: "company, role, location, source, status, and notes are required",
    });
  }

  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
    });
  }

  const job = await prisma.job.create({
    data: {
      company,
      role,
      location,
      source,
      status,
      notes,
      ...(salary !== undefined && { salary }),
      ...(applicationDate !== undefined && { applicationDate: new Date(applicationDate) }),
      ...(interviewDate !== undefined && { interviewDate: new Date(interviewDate) }),
      userId,
    },
  });

  res.json(job);
});

/**
 * List jobs with cursor pagination and optional filters/search
 */
router.get("/", authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const limit = parseInt(req.query.limit, 10) || 10;
  const cursor = req.query.cursor;
  const { status, location, source, search } = req.query;

  const where = {
    userId,
    ...(status ? { status } : {}),
    ...(location ? { location: { contains: location, mode: "insensitive" } } : {}),
    ...(source ? { source: { contains: source, mode: "insensitive" } } : {}),
    ...(search
      ? {
          OR: [
            { company: { contains: search, mode: "insensitive" } },
            { role: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const jobs = await prisma.job.findMany({
    where,
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

  const hasMore = jobs.length > limit;
  const items = hasMore ? jobs.slice(0, limit) : jobs;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  res.json({
    items,
    nextCursor,
    hasMore,
  });
});

/**
 * Update a job entry
 */
router.patch("/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const {
    company,
    role,
    location,
    source,
    status,
    notes,
    salary,
    applicationDate,
    interviewDate,
  } = req.body;
  const userId = req.user.userId;

  const job = await prisma.job.findFirst({
    where: { id, userId },
  });

  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }

  if (status !== undefined && !validStatuses.includes(status)) {
    return res.status(400).json({
      error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
    });
  }

  const data = {
    ...(company !== undefined && { company }),
    ...(role !== undefined && { role }),
    ...(location !== undefined && { location }),
    ...(source !== undefined && { source }),
    ...(status !== undefined && { status }),
    ...(notes !== undefined && { notes }),
    ...(salary !== undefined && { salary }),
    ...(applicationDate !== undefined && { applicationDate: new Date(applicationDate) }),
    ...(interviewDate !== undefined && { interviewDate: new Date(interviewDate) }),
  };

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: "No valid fields provided for update" });
  }

  const updatedJob = await prisma.job.update({
    where: { id },
    data,
  });

  res.json(updatedJob);
});

/**
 * Delete a job entry
 */
router.delete("/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;

  const deleted = await prisma.job.deleteMany({
    where: {
      id,
      userId, // ownership check
    },
  });

  if (deleted.count === 0) {
    return res.status(404).json({ error: "Job not found" });
  }

  res.json({ message: "Job deleted" });
});

export default router;
