import express from "express";
import { getSupporters } from "../controllers/supportController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.get("/", protect, getSupporters);

export default router;
