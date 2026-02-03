// import dotenv from "dotenv";
// import app from "./app.js";

// dotenv.config();

// const PORT = process.env.PORT || 4000;

// app.listen(PORT, () => {
//   console.log(
//     `${process.env.APP_NAME} running on http://localhost:${PORT}`
//   );
// });



import dotenv from "dotenv";
dotenv.config(); 

import app from "./app.js";
import prisma from "./prismaClient.js";

const PORT = process.env.PORT || 4000;

async function startServer() {
  try {
    await prisma.$connect();
    console.log("✅ Database connected");

    app.listen(PORT, () => {
      console.log(
        `${process.env.APP_NAME || "MiniDesk"} running on http://localhost:${PORT}`
      );
    });
  } catch (err) {
    console.error("❌ Failed to connect to database", err);
    process.exit(1); // ❗ fail fast
  }
}

startServer();
