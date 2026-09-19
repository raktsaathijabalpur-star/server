import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import BloodRequest, { URGENCY_LEVELS } from "../models/BloodRequest.js";
import Donation from "../models/Donation.js";
import User, { BLOOD_GROUP_ENUM } from "../models/User.js";
import generateRequestId from "../utils/generateRequestId.js";
import { canDonateTo, compatibleDonorGroups } from "../utils/bloodCompatibility.js";
import { getIO } from "../socket/index.js";

const OPEN_STATES = ["Open", "Accepted"];
// A donor who gave blood recently is not offered as a "matching donor".
const DONATION_GAP_DAYS = 90;

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const asString = (value) => (typeof value === "string" ? value.trim() : undefined);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const cityRegex = (city) => new RegExp(`^${escapeRegExp(city)}$`, "i");

const fail = (res, status, message) => {
  res.status(status);
  throw new Error(message);
};

const loadRequestOr404 = async (res, id) => {
  if (!mongoose.isValidObjectId(id)) fail(res, 404, "Blood request not found");
  const request = await BloodRequest.findById(id);
  if (!request) fail(res, 404, "Blood request not found");
  return request;
};

// Push a socket event to one or more rooms. Never throws (sockets are a
// nice-to-have, the REST response must not fail because of them) and never
// broadcasts to everyone by accident when the room list is empty.
const emitTo = (rooms, event, payload) => {
  const list = (Array.isArray(rooms) ? rooms : [rooms]).filter(Boolean).map(String);
  if (list.length === 0) return;
  try {
    getIO().to(list).emit(event, payload);
  } catch (err) {
    // socket server not ready — ignore
  }
};

// Shapes a (lean) request for the current viewer:
//  - owner (patient)      -> sees helpers (accepted donors) with their details
//  - donor who accepted   -> sees the patient's contact phone
//  - any other donor      -> no helper identities, no phone number
const serializeRequest = (request, viewer) => {
  const me = String(viewer._id);
  const helpers = request.helpers ?? [];
  const isOwner = String(request.requestedBy?._id ?? request.requestedBy) === me;
  const hasHelped = helpers.some((h) => String(h.user?._id ?? h.user) === me);

  const out = {
    ...request,
    isOwner,
    hasHelped,
    helpersCount: helpers.length,
    bloodMatch: canDonateTo(viewer.bloodGroup, request.bloodGroup),
  };

  if (!isOwner) delete out.helpers;
  if (!isOwner && !hasHelped) delete out.contactPhone;
  return out;
};

/* ------------------------------------------------------------------ */
/* create                                                              */
/* ------------------------------------------------------------------ */

// @desc  Create a new blood request (patients only)
// @route POST /api/requests
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
    requiredBy,
  } = req.body;

  if (!bloodGroup || !asString(hospitalName) || !requiredBy) {
    fail(res, 400, "Please select a blood group, hospital and required date");
  }
  if (!BLOOD_GROUP_ENUM.includes(bloodGroup)) fail(res, 400, "Invalid blood group");
  if (urgency && !URGENCY_LEVELS.includes(urgency)) fail(res, 400, "Invalid urgency level");

  const units = Number(unitsRequired ?? 1);
  if (!Number.isInteger(units) || units < 1 || units > 20) {
    fail(res, 400, "Units required must be a whole number between 1 and 20");
  }

  const requiredDate = new Date(requiredBy);
  if (Number.isNaN(requiredDate.getTime())) fail(res, 400, "Required date is not valid");

  const requestId = await generateRequestId();

  const created = await BloodRequest.create({
    requestId,
    requestedBy: req.user._id,
    patientName: asString(patientName) || req.user.name,
    bloodGroup,
    unitsRequired: units,
    urgency: urgency || "Normal",
    hospitalName: asString(hospitalName),
    city: asString(city) || req.user.city || "Jabalpur",
    area: asString(area) || req.user.area,
    contactPhone: asString(contactPhone) || req.user.phone,
    notes: asString(notes),
    requiredBy: requiredDate,
  });

  // Tell every compatible donor who is online right now (donors join a
  // "donor:<bloodGroup>" room when their socket connects).
  emitTo(
    compatibleDonorGroups(created.bloodGroup).map((g) => `donor:${g}`),
    "request:new",
    {
      _id: created._id,
      requestId: created.requestId,
      bloodGroup: created.bloodGroup,
      urgency: created.urgency,
      hospitalName: created.hospitalName,
      city: created.city,
    }
  );

  res.status(201).json({
    success: true,
    request: serializeRequest(created.toObject(), req.user),
  });
});

/* ------------------------------------------------------------------ */
/* read                                                                */
/* ------------------------------------------------------------------ */

// @desc  Donor feed: open requests created by patients (most urgent first)
// @route GET /api/requests
export const getRequests = asyncHandler(async (req, res) => {
  const bloodGroup = asString(req.query.bloodGroup);
  const urgency = asString(req.query.urgency);
  const city = asString(req.query.city);
  const status = asString(req.query.status);

  const filter = {
    requestedBy: { $ne: req.user._id }, // never show a user their own requests
    status: OPEN_STATES.includes(status) ? status : { $in: OPEN_STATES },
  };
  if (bloodGroup) filter.bloodGroup = bloodGroup;
  if (urgency) filter.urgency = urgency;
  if (city) filter.city = cityRegex(city);

  const docs = await BloodRequest.find(filter)
    .populate("requestedBy", "name")
    .sort({ urgencyRank: 1, createdAt: -1 })
    .lean();

  const requests = docs.map((doc) => serializeRequest(doc, req.user));
  res.status(200).json({ success: true, count: requests.length, requests });
});

// @desc  "My requests"
//        patient -> requests they created
//        donor   -> requests they accepted
// @route GET /api/requests/mine?scope=active|history|all
export const getMyRequests = asyncHandler(async (req, res) => {
  const scope = ["active", "history", "all"].includes(req.query.scope) ? req.query.scope : "all";
  const isPatient = req.user.role === "patient";

  const filter = isPatient ? { requestedBy: req.user._id } : { "helpers.user": req.user._id };
  if (scope === "active") filter.status = { $in: OPEN_STATES };
  if (scope === "history") filter.status = { $in: ["Fulfilled", "Cancelled"] };

  let query = BloodRequest.find(filter).populate("requestedBy", "name");
  if (isPatient) {
    query = query.populate("helpers.user", "name phone bloodGroup city area");
  }

  const docs = await query
    .sort(scope === "active" ? { urgencyRank: 1, createdAt: -1 } : { createdAt: -1 })
    .lean();

  const requests = docs.map((doc) => serializeRequest(doc, req.user));
  res.status(200).json({ success: true, count: requests.length, requests });
});

// @desc  Single request
// @route GET /api/requests/:id
export const getRequestById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) fail(res, 404, "Blood request not found");

  const doc = await BloodRequest.findById(id)
    .populate("requestedBy", "name")
    .populate("helpers.user", "name phone bloodGroup city area")
    .lean();

  if (!doc) fail(res, 404, "Blood request not found");

  res.status(200).json({ success: true, request: serializeRequest(doc, req.user) });
});

// @desc  Donors who could give to this request (same city, compatible group,
//        available, not donated in the last 90 days). Requester only.
// @route GET /api/requests/:id/matching-donors
export const getMatchingDonors = asyncHandler(async (req, res) => {
  const request = await loadRequestOr404(res, req.params.id);

  if (String(request.requestedBy) !== String(req.user._id)) {
    fail(res, 403, "Only the requester can see matching donors");
  }

  const since = new Date(Date.now() - DONATION_GAP_DAYS * 24 * 60 * 60 * 1000);

  const filter = {
    role: "donor",
    availableToDonate: true,
    "privacy.showInMatches": { $ne: false }, // Profile -> Privacy Settings
    _id: { $ne: req.user._id },
    bloodGroup: { $in: compatibleDonorGroups(request.bloodGroup) },
    $or: [{ lastDonationDate: null }, { lastDonationDate: { $lte: since } }],
  };
  if (request.city) filter.city = cityRegex(request.city);

  const donors = await User.find(filter)
    .select("name bloodGroup city area lastDonationDate")
    .limit(50)
    .lean();

  res.status(200).json({ success: true, count: donors.length, donors });
});

/* ------------------------------------------------------------------ */
/* donor action: accept                                                */
/* ------------------------------------------------------------------ */

// @desc  Donor accepts a request ("I Can Donate")
// @route POST /api/requests/:id/accept   (alias: /:id/help)
export const acceptRequest = asyncHandler(async (req, res) => {
  const request = await loadRequestOr404(res, req.params.id);
  const userId = req.user._id;

  if (String(request.requestedBy) === String(userId)) {
    fail(res, 400, "You can't accept your own request");
  }
  if (!OPEN_STATES.includes(request.status)) {
    fail(res, 409, "This request is no longer open");
  }
  if (request.helpers.some((h) => String(h.user) === String(userId))) {
    fail(res, 409, "You have already accepted this request");
  }
  if (req.user.availableToDonate === false) {
    fail(res, 400, "You are marked as unavailable. Turn on 'Available to Donate' first");
  }
  if (!canDonateTo(req.user.bloodGroup, request.bloodGroup)) {
    fail(
      res,
      400,
      `Your blood group (${req.user.bloodGroup}) can't donate to a ${request.bloodGroup} patient`
    );
  }

  // Atomic update: even if two taps / two tabs arrive together, the donor is
  // added once, and only while the request is still open.
  const updated = await BloodRequest.findOneAndUpdate(
    {
      _id: request._id,
      status: { $in: OPEN_STATES },
      "helpers.user": { $ne: userId },
    },
    {
      $push: { helpers: { user: userId, respondedAt: new Date() } },
      $set: { status: "Accepted" },
    },
    { new: true }
  )
    .populate("requestedBy", "name")
    .lean();

  if (!updated) fail(res, 409, "This request is no longer open");

  emitTo(String(updated.requestedBy._id), "request:accepted", {
    _id: updated._id,
    requestId: updated.requestId,
    helpersCount: updated.helpers.length,
    donor: { id: userId, name: req.user.name, bloodGroup: req.user.bloodGroup },
  });

  res.status(200).json({
    success: true,
    message: "Thanks for offering to donate!",
    request: serializeRequest(updated, req.user),
  });
});

/* ------------------------------------------------------------------ */
/* patient actions: fulfill / cancel                                   */
/* ------------------------------------------------------------------ */

// @desc  Patient marks the request as fulfilled. Every donor who accepted
//        (or only the ones listed in body.donorIds) gets a Donation record.
// @route PATCH /api/requests/:id/fulfill
export const fulfillRequest = asyncHandler(async (req, res) => {
  const request = await loadRequestOr404(res, req.params.id);

  if (String(request.requestedBy) !== String(req.user._id)) {
    fail(res, 403, "Only the requester can mark this as fulfilled");
  }
  if (!OPEN_STATES.includes(request.status)) {
    fail(res, 409, `This request is already ${request.status.toLowerCase()}`);
  }

  const allHelperIds = request.helpers.map((h) => String(h.user));
  let creditedIds = allHelperIds;
  if (Array.isArray(req.body.donorIds)) {
    const wanted = new Set(req.body.donorIds.map(String));
    creditedIds = allHelperIds.filter((id) => wanted.has(id));
  }

  const now = new Date();
  const updated = await BloodRequest.findOneAndUpdate(
    { _id: request._id, requestedBy: req.user._id, status: { $in: OPEN_STATES } },
    { $set: { status: "Fulfilled", fulfilledAt: now } },
    { new: true }
  ).lean();

  if (!updated) fail(res, 409, "This request was already closed");

  if (creditedIds.length > 0) {
    await Donation.insertMany(
      creditedIds.map((donorId) => ({
        donor: donorId,
        request: updated._id,
        requestId: updated.requestId,
        source: "request",
        bloodGroup: updated.bloodGroup,
        location: updated.hospitalName,
        city: updated.city,
        date: now,
      }))
    );

    await User.updateMany(
      { _id: { $in: creditedIds } },
      { $inc: { donationsCount: 1, livesHelped: 1 }, $max: { lastDonationDate: now } }
    );
  }

  const notCredited = allHelperIds.filter((id) => !creditedIds.includes(id));
  const payload = { _id: updated._id, requestId: updated.requestId };
  emitTo(creditedIds, "request:fulfilled", { ...payload, credited: true });
  emitTo(notCredited, "request:fulfilled", { ...payload, credited: false });

  res.status(200).json({ success: true, request: serializeRequest(updated, req.user) });
});

// @desc  Patient cancels the request
// @route PATCH /api/requests/:id/cancel
export const cancelRequest = asyncHandler(async (req, res) => {
  const request = await loadRequestOr404(res, req.params.id);

  if (String(request.requestedBy) !== String(req.user._id)) {
    fail(res, 403, "Only the requester can cancel this request");
  }
  if (!OPEN_STATES.includes(request.status)) {
    fail(res, 409, `This request is already ${request.status.toLowerCase()}`);
  }

  const updated = await BloodRequest.findOneAndUpdate(
    { _id: request._id, requestedBy: req.user._id, status: { $in: OPEN_STATES } },
    { $set: { status: "Cancelled", cancelledAt: new Date() } },
    { new: true }
  ).lean();

  if (!updated) fail(res, 409, "This request was already closed");

  emitTo(
    updated.helpers.map((h) => h.user),
    "request:cancelled",
    { _id: updated._id, requestId: updated.requestId }
  );

  res.status(200).json({ success: true, request: serializeRequest(updated, req.user) });
});
