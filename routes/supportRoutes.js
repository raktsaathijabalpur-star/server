import express from "express";
import { submitSupport } from "../controllers/supportController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.post("/", protect, submitSupport);

export default router;
