import { Router } from "express";
import prisma from "../prismaClient.js";

const router = Router();

// READ-ONLY test route
router.get("/users", async (req, res) => {
  const users = await prisma.user.findMany();
  res.json(users);
});

export default router;
