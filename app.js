import express from "express";
import cors from "cors";

import healthRoutes from "./routes/health.routes.js";
import authRoutes from "./routes/auth.routes.js";
import debugRoutes from "./routes/debug.routes.js";
import protectedRoutes from "./routes/protected.routes.js";
import workLogRoutes from "./routes/worklogs.routes.js";
import todoRoutes from "./routes/todos.routes.js";
import noteRoutes from "./routes/notes.routes.js";

const app = express();
app.use(cors());

app.use(express.json());

app.use("/api", healthRoutes);
app.use("/api/debug", debugRoutes); 
app.use("/api/auth", authRoutes);
app.use("/api", protectedRoutes);
app.use("/api/worklogs", workLogRoutes);
app.use("/api/todos", todoRoutes);
app.use("/api/notes", noteRoutes);

export default app;
