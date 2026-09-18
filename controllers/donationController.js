import asyncHandler from "express-async-handler";
import Donation from "../models/Donation.js";
import User from "../models/User.js";

// @desc  Logged-in donor's donation history (newest first)
// @route GET /api/donations/me
export const getMyDonations = asyncHandler(async (req, res) => {
  const donations = await Donation.find({ donor: req.user._id })
    .sort({ date: -1, createdAt: -1 })
    .lean();

  res.status(200).json({ success: true, count: donations.length, donations });
});

// @desc  Donor adds a past donation manually ("+ Add Donation")
// @route POST /api/donations
export const addDonation = asyncHandler(async (req, res) => {
  const location = typeof req.body.location === "string" ? req.body.location.trim() : "";
  const date = new Date(req.body.date);

  if (!location || !req.body.date) {
    res.status(400);
    throw new Error("Please provide the donation date and hospital / blood bank");
  }
  if (Number.isNaN(date.getTime())) {
    res.status(400);
    throw new Error("Donation date is not valid");
  }
  // 1 day of slack so "today" is never rejected because of time zones
  if (date.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
    res.status(400);
    throw new Error("Donation date can't be in the future");
  }

  const donation = await Donation.create({
    donor: req.user._id,
    source: "manual",
    bloodGroup: req.user.bloodGroup,
    location,
    city: req.user.city,
    date,
  });

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $inc: { donationsCount: 1 }, $max: { lastDonationDate: date } },
    { new: true }
  );

  res.status(201).json({ success: true, donation, user: user.toPublicJSON() });
});

// @desc  Leaderboard: donors ranked by total donations
// @route GET /api/donors/top
export const getTopDonors = asyncHandler(async (req, res) => {
  const donors = await User.find({ role: "donor", donationsCount: { $gt: 0 } })
    .sort({ donationsCount: -1, lastDonationDate: -1 })
    .limit(20)
    .select("name bloodGroup city donationsCount avatarUrl")
    .lean();

  res.status(200).json({ success: true, donors });
});
