import asyncHandler from "express-async-handler";
import Support from "../models/Support.js";

const MAX_AMOUNT = 1000000; // ₹10,00,000

// Which records the Supporters page may show.
//  - default: only "verified" ones (you confirmed the money reached the account)
//  - SUPPORTERS_SHOW_PENDING=true in .env: also the ones still "pending" (handy while testing)
const visibleStatuses = () =>
  process.env.SUPPORTERS_SHOW_PENDING === "true" ? ["verified", "pending"] : ["verified"];

// @desc  User says "I've donated" (bank transfer / QR). Saved as "pending".
// @route POST /api/support
export const submitSupport = asyncHandler(async (req, res) => {
  const amount = Number(req.body.amount);
  const { method } = req.body;

  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_AMOUNT) {
    res.status(400);
    throw new Error("Please enter an amount between ₹1 and ₹10,00,000");
  }
  if (!["bank", "qr"].includes(method)) {
    res.status(400);
    throw new Error("Please choose Bank Transfer or QR Code");
  }

  const support = await Support.create({
    user: req.user._id,
    amount,
    method,
    showName: req.body.showName === true, // only an explicit `true` makes the name public
  });

  res.status(201).json({
    success: true,
    message: "Thank you! We'll confirm your contribution once it reaches our account.",
    support: { _id: support._id, amount: support.amount, method: support.method, status: support.status },
  });
});

// @desc  Supporters page: recent contributions made from Profile -> Donate Now
// @route GET /api/supporters
export const getSupporters = asyncHandler(async (req, res) => {
  const filter = { status: { $in: visibleStatuses() } };

  const [docs, supporterIds, totals] = await Promise.all([
    Support.find(filter).sort({ createdAt: -1 }).limit(50).populate("user", "name").lean(),
    Support.distinct("user", filter),
    Support.aggregate([{ $match: filter }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
  ]);

  const supporters = docs.map((doc) => ({
    _id: doc._id,
    // the name is shown only if the person allowed it (and the account still exists)
    name: doc.showName === true && doc.user?.name ? doc.user.name : "Anonymous supporter",
    amount: doc.amount,
    status: doc.status,
    timestamp: doc.createdAt,
  }));

  res.status(200).json({
    success: true,
    totalCount: supporterIds.length, // distinct people, not number of payments
    totalAmount: totals[0]?.total ?? 0,
    supporters,
  });
});
