import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import Support from "../models/Support.js";
import { getIO } from "../socket/index.js";

const STATUSES = ["pending", "verified", "rejected"];

const shape = (doc) => ({
  _id: doc._id,
  amount: doc.amount,
  method: doc.method,
  status: doc.status,
  showName: doc.showName === true, // will the name be public on the Supporters page?
  createdAt: doc.createdAt,
  user: doc.user ? { _id: doc.user._id, name: doc.user.name, phone: doc.user.phone } : null,
});

// @desc  Contributions reported from Profile -> "I've Donated", by status (admin only)
// @route GET /api/admin/support?status=pending|verified|rejected
export const listSupport = asyncHandler(async (req, res) => {
  const status = STATUSES.includes(req.query.status) ? req.query.status : "pending";

  const [docs, grouped] = await Promise.all([
    Support.find({ status }).sort({ createdAt: -1 }).limit(100).populate("user", "name phone").lean(),
    Support.aggregate([{ $group: { _id: "$status", count: { $sum: 1 }, amount: { $sum: "$amount" } } }]),
  ]);

  const counts = { pending: 0, verified: 0, rejected: 0 };
  const amounts = { pending: 0, verified: 0, rejected: 0 };
  for (const row of grouped) {
    if (row._id in counts) {
      counts[row._id] = row.count;
      amounts[row._id] = row.amount;
    }
  }

  res.status(200).json({ success: true, status, counts, amounts, items: docs.map(shape) });
});

// @desc  Confirm or reject a contribution (or move it back to pending)
// @route PATCH /api/admin/support/:id   body: { status }
export const updateSupportStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body ?? {};

  if (!mongoose.isValidObjectId(id)) {
    res.status(404);
    throw new Error("Contribution not found");
  }
  if (!STATUSES.includes(status)) {
    res.status(400);
    throw new Error("Status must be pending, verified or rejected");
  }

  const existing = await Support.findById(id).select("status user amount").lean();
  if (!existing) {
    res.status(404);
    throw new Error("Contribution not found");
  }

  const updated = await Support.findByIdAndUpdate(id, { $set: { status } }, { new: true })
    .populate("user", "name phone")
    .lean();

  // Tell the donor (if they're online) — only the first time it becomes verified
  if (status === "verified" && existing.status !== "verified" && existing.user) {
    try {
      getIO().to(String(existing.user)).emit("support:verified", { amount: existing.amount });
    } catch (err) {
      // socket server not ready — ignore
    }
  }

  res.status(200).json({ success: true, item: shape(updated) });
});
