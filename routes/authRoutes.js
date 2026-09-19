import express from "express";
import {
  registerUser,
  loginUser,
  getMe,
  updateMe,
  changePassword,
  deleteMe,
} from "../controllers/authController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/me", protect, getMe);
router.put("/me", protect, updateMe);
router.delete("/me", protect, deleteMe); // Profile -> Delete Account
router.put("/password", protect, changePassword); // Profile -> Privacy Settings

export default router;
