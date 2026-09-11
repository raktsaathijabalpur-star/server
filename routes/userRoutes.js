import express from "express";
import { protect } from "../middleware/auth.js";
import { getAllUsers } from "../controllers/userController.js";

const router = express.Router();

router.use(protect);
router.get("/", getAllUsers);

export default router;