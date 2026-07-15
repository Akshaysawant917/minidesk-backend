import { Router } from "express";
import prisma from "../prismaClient.js";
import authMiddleware from "../middleware/auth.middleware.js";

const router = Router();

// Create a bookmark
router.post("/", authMiddleware, async (req, res) => {
  const { title, url, favicon } = req.body;
  const userId = req.user.userId;

  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  try {
    const bookmark = await prisma.bookmark.create({
      data: {
        title,
        url,
        favicon,
        userId,
      },
    });

    res.json(bookmark);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create bookmark" });
  }
});

// List bookmarks for the authenticated user
router.get("/", authMiddleware, async (req, res) => {
  const userId = req.user.userId;

  try {
    const bookmarks = await prisma.bookmark.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    res.json(bookmarks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch bookmarks" });
  }
});

export default router;
