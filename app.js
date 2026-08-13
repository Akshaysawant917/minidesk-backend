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
import folderRoutes from "./routes/folders.routes.js";
import jobRoutes from "./routes/jobs.routes.js";
import commandRoutes from "./routes/commands.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";

const app = express();
// CORS: allow exact frontend origins or a configured FRONTEND_URL
const whitelist = [
	"https://getminidesk.com",
	"https://www.getminidesk.com",
];
if (process.env.FRONTEND_URL) whitelist.push(process.env.FRONTEND_URL);

const corsOptions = {
	origin: (origin, callback) => {
		// allow server-to-server or curl (no origin)
		if (!origin) return callback(null, true);
		try {
			const url = new URL(origin);
			const hostname = url.hostname;
			if (whitelist.includes(origin) || whitelist.includes(url.origin) || hostname.endsWith(".getminidesk.com")) {
				return callback(null, true);
			}
		} catch (e) {
			// if origin isn't a valid URL, reject
		}
		callback(new Error("CORS: Not allowed origin"));
	},
	credentials: true,
	methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
	allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));

app.use(express.json());

app.use("/api", healthRoutes);
app.use("/api/debug", debugRoutes); 
app.use("/api/auth", authRoutes);
app.use("/api", protectedRoutes);
app.use("/api/worklogs", workLogRoutes);
app.use("/api/todos", todoRoutes);
app.use("/api/bookmarks", bookmarkRoutes);
app.use("/api/notes", noteRoutes);
app.use("/api/folders", folderRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/commands", commandRoutes);
app.use("/api/dashboard", dashboardRoutes);

export default app;


