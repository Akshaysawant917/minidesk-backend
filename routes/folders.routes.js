import { Router } from "express";
import prisma from "../prismaClient.js";
import authMiddleware from "../middleware/auth.middleware.js";

const router = Router();

// GET /folders - list user's folders
router.get("/", authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const folders = await prisma.folder.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  res.json(folders);
});

// POST /folders - create folder
router.post("/", authMiddleware, async (req, res) => {
  const { name, position } = req.body;
  const userId = req.user.userId;

  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "Folder name is required" });
  }

  try {
    const folder = await prisma.folder.create({ data: { name, userId, ...(position !== undefined && { position }) } });
    res.json(folder);
  } catch (err) {
    // handle unique constraint
    if (err.code === "P2002") {
      return res.status(409).json({ error: "Folder with this name already exists" });
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /folders/:id - rename or update position
router.patch("/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { name, position } = req.body;
  const userId = req.user.userId;

  const folder = await prisma.folder.findFirst({ where: { id, userId } });
  if (!folder) return res.status(404).json({ error: "Folder not found" });

  const data = {};
  if (name !== undefined) data.name = name;
  if (position !== undefined) data.position = position;

  try {
    const updated = await prisma.folder.update({ where: { id }, data });
    res.json(updated);
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: "Folder with this name already exists" });
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /folders/:id - unset folderId on notes, then delete folder
router.delete("/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;

  const folder = await prisma.folder.findFirst({ where: { id, userId } });
  if (!folder) return res.status(404).json({ error: "Folder not found" });

  try {
    await prisma.$transaction([
      prisma.note.updateMany({ where: { folderId: id }, data: { folderId: null } }),
      prisma.folder.delete({ where: { id } }),
    ]);

    res.json({ message: "Folder deleted, notes moved to inbox" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /folders/:id/notes - list notes in folder (paginated)
router.get("/:id/notes", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;
  const limit = parseInt(req.query.limit) || 10;
  const cursor = req.query.cursor;

  const folder = await prisma.folder.findFirst({ where: { id, userId } });
  if (!folder) return res.status(404).json({ error: "Folder not found" });

  const notes = await prisma.note.findMany({
    where: { userId, folderId: id },
    orderBy: [ { updatedAt: "desc" }, { id: "desc" } ],
    take: limit + 1,
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
  });

  const hasMore = notes.length > limit;
  const items = hasMore ? notes.slice(0, limit) : notes;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  res.json({ items, nextCursor, hasMore });
});

export default router;
