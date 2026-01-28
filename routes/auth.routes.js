import { Router } from "express";
import bcrypt from "bcrypt";
import prisma from "../prismaClient.js";
import jwt from "jsonwebtoken";


const router = Router();

router.post("/signup", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
      },
    });

    res.json({
      id: user.id,
      username: user.username,
    });
  } catch (error) {
    // Prisma unique constraint error
    if (error.code === "P2002") {
      return res.status(409).json({
        error: "Username already exists",
      });
    }

    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});


router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  const user = await prisma.user.findUnique({
    where: { username },
  });

  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

const isMatch = await bcrypt.compare(password, user.password);

if (!isMatch) {
  return res.status(401).json({ error: "Invalid credentials" });
}

const token = jwt.sign(
  {
    userId: user.id,
    username: user.username,
  },
  process.env.JWT_SECRET,
  { expiresIn: "7d" }
);

res.json({ token });

});


export default router;
