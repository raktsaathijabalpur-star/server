import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import morgan from "morgan";
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import requestRoutes from "./routes/requestRoutes.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";
import http from "http";
import { initSocket } from "./socket/index.js";
import messageRoutes from "./routes/chatRoutes.js";
import userRoutes from "./routes/userRoutes.js";

dotenv.config();
connectDB();

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());
app.use(morgan("dev"));

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "RaktSaathi API is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api", messageRoutes);
app.use("/api/users", userRoutes);
app.use("/api/requests", requestRoutes);

// 404 + error handler — routes ke turant baad, listen se pehle
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);
initSocket(server);

server.listen(PORT, () => {
  console.log(`Server + Socket.io running on port ${PORT}`);
});