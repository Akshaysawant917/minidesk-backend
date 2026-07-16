import express from "express";
import cors from "cors";

import healthRoutes from "./routes/health.routes.js";
import authRoutes from "./routes/auth.routes.js";
import debugRoutes from "./routes/debug.routes.js";
import protectedRoutes from "./routes/protected.routes.js";
import workLogRoutes from "./routes/worklogs.routes.js";
import todoRoutes from "./routes/todos.routes.js";
import bookmarkRoutes from "./routes/bookmarks.routes.js";
import noteRoutes from "./routes/notes.routes.js";
import jobRoutes from "./routes/jobs.routes.js";
import commandRoutes from "./routes/commands.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";

const app = express();
app.use(cors());

app.use(express.json());

app.use("/api", healthRoutes);
app.use("/api/debug", debugRoutes); 
app.use("/api/auth", authRoutes);
app.use("/api", protectedRoutes);
app.use("/api/worklogs", workLogRoutes);
app.use("/api/todos", todoRoutes);
app.use("/api/bookmarks", bookmarkRoutes);
app.use("/api/notes", noteRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/commands", commandRoutes);
app.use("/api/dashboard", dashboardRoutes);

export default app;


