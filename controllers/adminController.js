import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import Support from "../models/Support.js";
import User from "../models/User.js";
import { notifyUser } from "../utils/notify.js";

const STATUSES = ["pending", "verified", "rejected"];

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const emptyTotals = () => ({ pending: 0, verified: 0, rejected: 0 });

const shape = (doc) => ({
  _id: doc._id,
  amount: doc.amount,
  method: doc.method,
  status: doc.status,
  showName: doc.showName === true, // will the name be public on the Supporters page?
  createdAt: doc.createdAt,
  reviewedAt: doc.reviewedAt ?? null,
  reviewedBy: doc.reviewedBy ? { _id: doc.reviewedBy._id, name: doc.reviewedBy.name } : null,
  user: doc.user ? { _id: doc.user._id, name: doc.user.name, phone: doc.user.phone } : null,
});

// count + amount per status over ALL contributions
async function totalsByStatus() {
  const grouped = await Support.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 }, amount: { $sum: "$amount" } } },
  ]);
  const counts = emptyTotals();
  const amounts = emptyTotals();
  for (const row of grouped) {
    if (row._id in counts) {
      counts[row._id] = row.count;
      amounts[row._id] = row.amount;
    }
  }
  return { counts, amounts };
}

// @desc  Contributions reported from Profile -> "I've Donated" (admin only), with paging + search
// @route GET /api/admin/support?status=all|pending|verified|rejected&q=name-or-phone&page=1&limit=20
export const listSupport = asyncHandler(async (req, res) => {
  const status =
    req.query.status === "all" ? "all" : STATUSES.includes(req.query.status) ? req.query.status : "pending";
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 60) : "";
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);

  const filter = status === "all" ? {} : { status };
  if (q) {
    const rx = new RegExp(escapeRegExp(q), "i");
    const people = await User.find({ $or: [{ name: rx }, { phone: rx }] })
      .select("_id")
      .limit(200)
      .lean();
    filter.user = { $in: people.map((u) => u._id) };
  }

  const [docs, total, filteredAgg, { counts, amounts }] = await Promise.all([
    Support.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("user", "name phone")
      .populate("reviewedBy", "name")
      .lean(),
    Support.countDocuments(filter),
    Support.aggregate([{ $match: filter }, { $group: { _id: null, amount: { $sum: "$amount" } } }]),
    totalsByStatus(),
  ]);

  res.status(200).json({
    success: true,
    status,
    q,
    page,
    pages: Math.max(Math.ceil(total / limit), 1),
    total,
    filteredAmount: filteredAgg[0]?.amount ?? 0,
    counts,
    amounts,
    items: docs.map(shape),
  });
});

// @desc  Dashboard numbers for the admin overview
// @route GET /api/admin/overview
export const getOverview = asyncHandler(async (req, res) => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [{ counts, amounts }, supporterIds, monthAgg, topRows, recentDocs, waitingDocs] = await Promise.all([
    totalsByStatus(),
    Support.distinct("user", { status: "verified" }),
    Support.aggregate([
      { $match: { status: "verified", createdAt: { $gte: monthStart } } },
      { $group: { _id: null, amount: { $sum: "$amount" } } },
    ]),
    Support.aggregate([
      { $match: { status: "verified" } },
      { $group: { _id: "$user", total: { $sum: "$amount" }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: 5 },
    ]),
    Support.find({}).sort({ createdAt: -1 }).limit(8).populate("user", "name phone").populate("reviewedBy", "name").lean(),
    Support.find({ status: "pending" }).sort({ createdAt: 1 }).limit(5).populate("user", "name phone").lean(),
  ]);

  const topUsers = await User.find({ _id: { $in: topRows.map((t) => t._id) } })
    .select("name phone")
    .lean();
  const byId = new Map(topUsers.map((u) => [String(u._id), u]));

  res.status(200).json({
    success: true,
    counts,
    amounts,
    contributors: supporterIds.length, // distinct people with a verified contribution
    thisMonth: monthAgg[0]?.amount ?? 0,
    topContributors: topRows.map((row) => ({
      user: byId.get(String(row._id)) ? { _id: row._id, name: byId.get(String(row._id)).name, phone: byId.get(String(row._id)).phone } : null,
      total: row.total,
      count: row.count,
    })),
    waiting: waitingDocs.map(shape), // pending, oldest first = waiting the longest
    recent: recentDocs.map(shape),
  });
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

  // remember who reviewed it and when; moving back to pending clears that
  const update =
    status === "pending"
      ? { $set: { status }, $unset: { reviewedAt: 1, reviewedBy: 1 } }
      : { $set: { status, reviewedAt: new Date(), reviewedBy: req.user._id } };

  const updated = await Support.findByIdAndUpdate(id, update, { new: true })
    .populate("user", "name phone")
    .populate("reviewedBy", "name")
    .lean();

  // tell the donor — only the first time it becomes verified
  if (status === "verified" && existing.status !== "verified" && updated.user) {
    // (updated.user is null when that account was deleted — nobody to tell)
    await notifyUser(existing.user, {
      type: "support:verified",
      title: "Contribution confirmed",
      body: `Thank you! Your ₹${Number(existing.amount).toLocaleString("en-IN")} contribution to Jabalpur Blood Seva was confirmed.`,
      link: "/supporters",
    });
  }

  res.status(200).json({ success: true, item: shape(updated) });
});
