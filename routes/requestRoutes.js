import express from "express";
import {
  createRequest,
  getRequests,
  getRequestById,
  respondToRequest,
  fulfillRequest,
} from "../controllers/requestController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.route("/").get(protect, getRequests).post(protect, createRequest);
router.route("/:id").get(protect, getRequestById);
router.route("/:id/help").post(protect, respondToRequest);
router.route("/:id/fulfill").patch(protect, fulfillRequest);

export default router;
