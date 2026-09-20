import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import morgan from "morgan";
import http from "http";
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import requestRoutes from "./routes/requestRoutes.js";
import donationRoutes from "./routes/donationRoutes.js";
import supportRoutes from "./routes/supportRoutes.js";
import supporterRoutes from "./routes/supporterRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import messageRoutes from "./routes/chatRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";
import { initSocket } from "./socket/index.js";
import { corsOrigin } from "./utils/origins.js";

dotenv.config();
connectDB();

const app = express();

app.use(
  cors({
    origin: corsOrigin, // CLIENT_URL: one or more website addresses, comma separated
    credentials: true,
  })
);
app.use(express.json());
app.use(morgan("dev"));

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "Jabalpur Blood Seva API is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/requests", requestRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/supporters", supporterRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationRoutes);
// Mounted at "/api": exposes /api/donations/me, /api/donations, /api/donors/top
app.use("/api", donationRoutes);
// chatRoutes applies `protect` to everything under "/api", so it must stay the
// LAST "/api" router — otherwise it would run before the routers above.
app.use("/api", messageRoutes);

// 404 + error handler — routes ke turant baad, listen se pehle
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);
initSocket(server);

server.listen(PORT, () => {
  console.log(`Server + Socket.io running on port ${PORT}`);
});
