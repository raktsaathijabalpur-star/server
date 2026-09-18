import express from "express";
import {
  createRequest,
  getRequests,
  getMyRequests,
  getRequestById,
  getMatchingDonors,
  acceptRequest,
  fulfillRequest,
  cancelRequest,
} from "../controllers/requestController.js";
import { protect, requireRole } from "../middleware/auth.js";

const router = express.Router();

router.use(protect);

// NOTE: "/mine" must be declared before "/:id", otherwise Express would
// treat the word "mine" as a request id.
router.get("/mine", getMyRequests);

router
  .route("/")
  .get(requireRole("donor"), getRequests) // donor feed
  .post(requireRole("patient"), createRequest); // patient creates

router.get("/:id", getRequestById);
router.get("/:id/matching-donors", requireRole("patient"), getMatchingDonors);

router.post("/:id/accept", requireRole("donor"), acceptRequest);
router.post("/:id/help", requireRole("donor"), acceptRequest); // old name, kept as alias

router.patch("/:id/fulfill", requireRole("patient"), fulfillRequest);
router.patch("/:id/cancel", requireRole("patient"), cancelRequest);

export default router;
