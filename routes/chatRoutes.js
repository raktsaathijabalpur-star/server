import express from "express";
import { protect } from "../middleware/auth.js"; 
import {
  getConversations,
  startConversation,
  getMessages,
} from "../controllers/messageController.js";

const router = express.Router();

router.use(protect);

router.get("/conversations", getConversations);
router.post("/conversations", startConversation);
router.get("/conversations/:id/messages", getMessages);

export default router;