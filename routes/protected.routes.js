import { Router } from "express";
import authMiddleware from "../middleware/auth.middleware.js";

const router = Router();

router.get("/me", authMiddleware, (req, res) => {
  res.json({
    message: "You are authenticated",
    user: req.user,
  });
});

export default router;
