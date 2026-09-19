import express from "express";
import {
  listNotifications,
  markRead,
  deleteNotification,
  clearNotifications,
} from "../controllers/notificationController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.use(protect);

router.get("/", listNotifications);
router.patch("/read", markRead);
router.delete("/", clearNotifications);
router.delete("/:id", deleteNotification);

export default router;
