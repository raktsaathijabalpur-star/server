import express from "express";
import { listSupport, updateSupportStatus } from "../controllers/adminController.js";
import { protect, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

// Everything under /api/admin needs a logged-in ADMIN user
router.use(protect, requireAdmin);

router.get("/support", listSupport);
router.patch("/support/:id", updateSupportStatus);

export default router;
