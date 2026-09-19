import express from "express";
import { protect } from "../middleware/auth.js";
import { getAllUsers, getUserAvatar } from "../controllers/userController.js";

const router = express.Router();

// Public: profile photos are loaded by <img> tags, which can't send the login token
router.get("/:id/avatar", getUserAvatar);

router.use(protect);
router.get("/", getAllUsers);

export default router;
