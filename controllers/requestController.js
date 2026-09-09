import asyncHandler from "express-async-handler";
import BloodRequest from "../models/BloodRequest.js";
import User from "../models/User.js";

// @desc  Create a new blood request
// @route POST /api/requests
// @access Private
export const createRequest = asyncHandler(async (req, res) => {
  const {
    patientName,
    bloodGroup,
    unitsRequired,
    urgency,
    hospitalName,
    city,
    area,
    contactPhone,
    notes,
  } = req.body;

  if (!patientName || !bloodGroup || !unitsRequired || !hospitalName || !contactPhone) {
    res.status(400);
    throw new Error("Please fill all required fields for the blood request");
  }

  const request = await BloodRequest.create({
    requestedBy: req.user._id,
    patientName,
    bloodGroup,
    unitsRequired,
    urgency,
    hospitalName,
    city,
    area,
    contactPhone,
    notes,
  });

  res.status(201).json({ success: true, request });
});

// @desc  Get nearby / all open blood requests (with optional filters)
// @route GET /api/requests
// @access Private
export const getRequests = asyncHandler(async (req, res) => {
  const { bloodGroup, urgency, city, status } = req.query;

  const filter = {};
  if (bloodGroup) filter.bloodGroup = bloodGroup;
  if (urgency) filter.urgency = urgency;
  if (city) filter.city = city;
  filter.status = status || "Open";

  const requests = await BloodRequest.find(filter)
    .populate("requestedBy", "name phone")
    .sort({ urgency: 1, createdAt: -1 })
    .lean();

  res.status(200).json({ success: true, count: requests.length, requests });
});

// @desc  Get a single request by id
// @route GET /api/requests/:id
// @access Private
export const getRequestById = asyncHandler(async (req, res) => {
  const request = await BloodRequest.findById(req.params.id).populate(
    "requestedBy",
    "name phone"
  );

  if (!request) {
    res.status(404);
    throw new Error("Blood request not found");
  }

  res.status(200).json({ success: true, request });
});

// @desc  Offer help / respond to a request ("I Can Help")
// @route POST /api/requests/:id/help
// @access Private
export const respondToRequest = asyncHandler(async (req, res) => {
  const request = await BloodRequest.findById(req.params.id);

  if (!request) {
    res.status(404);
    throw new Error("Blood request not found");
  }

  const alreadyResponded = request.helpers.some(
    (h) => h.user.toString() === req.user._id.toString()
  );

  if (alreadyResponded) {
    res.status(409);
    throw new Error("You have already offered to help with this request");
  }

  request.helpers.push({ user: req.user._id });
  await request.save();

  res.status(200).json({ success: true, message: "Thanks for offering to help!", request });
});

// @desc  Mark request as fulfilled (only by creator)
// @route PATCH /api/requests/:id/fulfill
// @access Private
export const fulfillRequest = asyncHandler(async (req, res) => {
  const request = await BloodRequest.findById(req.params.id);

  if (!request) {
    res.status(404);
    throw new Error("Blood request not found");
  }

  if (request.requestedBy.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error("Only the requester can mark this as fulfilled");
  }

  request.status = "Fulfilled";
  await request.save();

  await User.findByIdAndUpdate(req.user._id, { $inc: { livesHelped: 1 } });

  res.status(200).json({ success: true, request });
});
