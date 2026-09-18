import express from "express";
import { getMyDonations, addDonation, getTopDonors } from "../controllers/donationController.js";
import { protect, requireRole } from "../middleware/auth.js";

// Mounted at "/api" in server.js, so the full paths are:
//   GET  /api/donations/me
//   POST /api/donations
//   GET  /api/donors/top
const router = express.Router();

router.get("/donations/me", protect, getMyDonations);
router.post("/donations", protect, requireRole("donor"), addDonation);
router.get("/donors/top", protect, getTopDonors);

export default router;
