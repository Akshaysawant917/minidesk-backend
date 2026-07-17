import { Router } from "express";
import bcrypt from "bcrypt";
import prisma from "../prismaClient.js";
import jwt from "jsonwebtoken";
import { sendVerificationEmail } from "../utils/sendVerificationEmail.js";


const router = Router();

router.post("/signup", async (req, res) => {
  const { email, password, username } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const userData = {
      email,
      password: hashedPassword,
      emailVerified: false,
    };

    if (username) {
      userData.username = username;
    }

    const user = await prisma.user.create({
      data: userData,
    });

    // generate a short verification token (JWT) valid for 24h
    const verifyToken = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "24h" });

    // send verification email (assumes sendVerificationEmail exists)
    try {
      await sendVerificationEmail(user.email, verifyToken);
    } catch (err) {
      console.error("Failed to send verification email:", err);
      // rollback created user to avoid having unverified leftover accounts
      try {
        await prisma.user.delete({ where: { id: user.id } });
      } catch (delErr) {
        console.error("Failed to delete user after email send failure:", delErr);
      }
      return res.status(500).json({ error: "Failed to send verification email" });
    }

    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      message: "Signup successful. Verification email sent.",
    });
  } catch (error) {
    // Prisma unique constraint error
    if (error.code === "P2002") {
      return res.status(409).json({
        error: "Email or username already exists",
      });
    }

    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/verify-email", async (req, res) => {
  const token = Array.isArray(req.query.token) ? req.query.token[0] : req.query.token;

  if (!token) {
    return res.status(400).json({ error: "Verification token required" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.emailVerified) {
      return res.json({ message: "Email already verified" });
    }

    await prisma.user.update({
      where: { id: payload.userId },
      data: { emailVerified: true },
    });

    res.json({ message: "Email verified" });
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(400).json({ error: "Verification token expired" });
    }

    console.error(error);
    res.status(400).json({ error: "Invalid verification token" });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  if (!user.emailVerified) {
    return res.status(403).json({ error: "Email not verified" });
  }

  const token = jwt.sign(
    {
      userId: user.id,
      email: user.email,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({ token });

});


export default router;
