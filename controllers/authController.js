import asyncHandler from "express-async-handler";
import User, { ROLE_ENUM, BLOOD_GROUP_ENUM } from "../models/User.js";
import BloodRequest from "../models/BloodRequest.js";
import Donation from "../models/Donation.js";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import generateToken from "../utils/generateToken.js";
import { getIO } from "../socket/index.js";

const OPEN_STATES = ["Open", "Accepted"];

const fail = (res, status, message) => {
  res.status(status);
  throw new Error(message);
};

// @desc  Register a new user
// @route POST /api/auth/register
// @access Public
export const registerUser = asyncHandler(async (req, res) => {
  const {
    name,
    phone,
    email,
    password,
    role,
    bloodGroup,
    city,
    state,
    area,
    pincode,
    dateOfBirth,
    gender,
    avatarUrl,
  } = req.body;

  if (!name || !phone || !password || !bloodGroup) {
    res.status(400);
    throw new Error("Please provide name, phone, password and blood group");
  }

  const existingUser = await User.findOne({
    $or: [{ phone }, ...(email ? [{ email }] : [])],
  });

  if (existingUser) {
    res.status(409);
    throw new Error("An account with this phone or email already exists");
  }

  // Only "donor" or "patient" can be chosen at signup. Anything else -> donor.
  const safeRole = ROLE_ENUM.includes(role) ? role : "donor";

  const user = await User.create({
    name,
    phone,
    email,
    password,
    role: safeRole,
    bloodGroup,
    city,
    state,
    area,
    pincode,
    dateOfBirth: dateOfBirth || null,
    gender: gender || null,
    avatarUrl,
  });

  const token = generateToken(user._id);

  res.status(201).json({
    success: true,
    token,
    user: user.toPublicJSON(),
  });
});

// @desc  Login user
// @route POST /api/auth/login
// @access Public
export const loginUser = asyncHandler(async (req, res) => {
  const { identifier, password } = req.body;

  if (!identifier || !password) {
    res.status(400);
    throw new Error("Please provide your phone/email and password");
  }

  const user = await User.findOne({
    $or: [{ phone: identifier }, { email: identifier.toLowerCase() }],
  }).select("+password");

  if (!user || !(await user.comparePassword(password))) {
    res.status(401);
    throw new Error("Invalid credentials");
  }

  const token = generateToken(user._id);

  res.status(200).json({
    success: true,
    token,
    user: user.toPublicJSON(),
  });
});

// @desc  Get current logged in user
// @route GET /api/auth/me
// @access Private
export const getMe = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    user: req.user.toPublicJSON(),
  });
});

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENDERS = ["Male", "Female", "Other"];
// Profile photo: the frontend sends a ~160px JPEG as a data URL (~10-20 KB).
// Capped well under express.json()'s default 100 KB body limit.
const AVATAR_DATA_URL_RE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_AVATAR_LENGTH = 80000;

const TEXT_FIELDS = ["city", "state", "area", "pincode", "preferredArea"];

// Nested on/off settings the user may change (anything else is ignored)
const BOOLEAN_GROUPS = {
  privacy: ["showOnLeaderboard", "showInMatches"],
  notificationPrefs: ["newRequests", "requestUpdates"],
};

const parseDate = (res, value, label) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getFullYear() < 1900) {
    fail(res, 400, `${label} is not a valid date`);
  }
  // 1 day of slack so "today" is never rejected because of time zones
  if (date.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
    fail(res, 400, `${label} can't be in the future`);
  }
  return date;
};

// @desc  Update profile: personal info, blood info, location, availability,
//        photo, privacy and notification settings
// @route PUT /api/auth/me
// @access Private
// Every field is optional — send only what changed. Role and phone can't be changed here.
export const updateMe = asyncHandler(async (req, res) => {
  const body = req.body ?? {};
  const user = req.user;

  // 1) Validate everything first and collect the clean values in `updates`.
  //    If anything is wrong we throw before touching the user, so a request
  //    either applies completely or not at all.
  const updates = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name || name.length > 80) fail(res, 400, "Please enter your name (up to 80 characters)");
    updates.name = name;
  }

  if (body.email !== undefined) {
    const email = String(body.email).trim().toLowerCase();
    if (email) {
      if (!EMAIL_RE.test(email)) fail(res, 400, "Please enter a valid email address");
      const taken = await User.findOne({ email, _id: { $ne: user._id } });
      if (taken) fail(res, 409, "This email is already used by another account");
      updates.email = email;
    } else {
      // must be *unset*, not "" — the unique index would clash between two users with ""
      updates.email = undefined;
    }
  }

  if (body.bloodGroup !== undefined) {
    if (!BLOOD_GROUP_ENUM.includes(body.bloodGroup)) fail(res, 400, "Invalid blood group");
    updates.bloodGroup = body.bloodGroup;
  }

  if (body.gender !== undefined) {
    if (body.gender === "" || body.gender === null) updates.gender = null;
    else if (GENDERS.includes(body.gender)) updates.gender = body.gender;
    else fail(res, 400, "Invalid gender");
  }

  if (body.dateOfBirth !== undefined) {
    updates.dateOfBirth = body.dateOfBirth ? parseDate(res, body.dateOfBirth, "Date of birth") : null;
  }
  if (body.lastDonationDate !== undefined) {
    updates.lastDonationDate = body.lastDonationDate
      ? parseDate(res, body.lastDonationDate, "Last donation date")
      : null;
  }

  for (const field of TEXT_FIELDS) {
    if (body[field] !== undefined) updates[field] = String(body[field]).trim().slice(0, 120);
  }
  if ("city" in updates && !updates.city) fail(res, 400, "Please enter your city");
  if (updates.pincode && !/^\d{6}$/.test(updates.pincode)) fail(res, 400, "Pincode must be 6 digits");

  if (body.availableToDonate !== undefined) {
    if (typeof body.availableToDonate !== "boolean") fail(res, 400, "Invalid availability value");
    updates.availableToDonate = body.availableToDonate;
  }

  if (body.avatarUrl !== undefined) {
    const url = body.avatarUrl;
    const valid =
      url === "" ||
      (typeof url === "string" &&
        ((url.length <= MAX_AVATAR_LENGTH && AVATAR_DATA_URL_RE.test(url)) ||
          (url.length <= 500 && /^https:\/\/\S+$/.test(url))));
    if (!valid) fail(res, 400, "Please upload a JPG, PNG or WebP photo (small size)");
    updates.avatarUrl = url;
  }

  const toggles = {};
  for (const [group, keys] of Object.entries(BOOLEAN_GROUPS)) {
    const incoming = body[group];
    if (incoming && typeof incoming === "object") {
      for (const key of keys) {
        if (typeof incoming[key] === "boolean") toggles[`${group}.${key}`] = incoming[key];
      }
    }
  }

  // 2) Apply + save
  for (const [field, value] of Object.entries(updates)) user[field] = value;
  for (const [path, value] of Object.entries(toggles)) user.set(path, value);

  try {
    const updatedUser = await user.save();
    res.status(200).json({ success: true, user: updatedUser.toPublicJSON() });
  } catch (err) {
    if (err?.code === 11000) fail(res, 409, "This email is already used by another account");
    throw err;
  }
});

// @desc  Change password
// @route PUT /api/auth/password
// @access Private
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};

  if (!currentPassword || !newPassword) {
    fail(res, 400, "Please enter your current and new password");
  }
  if (String(newPassword).length < 6) fail(res, 400, "New password must be at least 6 characters");
  if (newPassword === currentPassword) {
    fail(res, 400, "New password must be different from the current one");
  }

  const user = await User.findById(req.user._id).select("+password");
  if (!user || !(await user.comparePassword(currentPassword))) {
    // 400, NOT 401: the frontend's axios interceptor logs the user out on every 401
    fail(res, 400, "Current password is incorrect");
  }

  user.password = newPassword; // hashed by the model's pre-save hook
  await user.save();

  res.status(200).json({ success: true, message: "Password updated" });
});

// @desc  Permanently delete the account and the personal data attached to it
// @route DELETE /api/auth/me   body: { password }
// @access Private
export const deleteMe = asyncHandler(async (req, res) => {
  const { password } = req.body ?? {};
  if (!password) fail(res, 400, "Please enter your password to delete your account");

  const user = await User.findById(req.user._id).select("+password");
  if (!user || !(await user.comparePassword(password))) {
    fail(res, 400, "Password is incorrect"); // 400, not 401 (see changePassword)
  }

  const userId = user._id;
  const now = new Date();

  // Everything below is safe to run twice, and the user itself is deleted LAST,
  // so if something fails half-way the person can simply try again.

  // 1) Requests this user created: cancel the open ones (tell the donors), then remove them all
  const ownOpen = await BloodRequest.find({
    requestedBy: userId,
    status: { $in: OPEN_STATES },
  }).select("requestId helpers");

  await BloodRequest.updateMany(
    { requestedBy: userId, status: { $in: OPEN_STATES } },
    { $set: { status: "Cancelled", cancelledAt: now } }
  );

  try {
    const io = getIO();
    for (const request of ownOpen) {
      const helperRooms = request.helpers.map((h) => String(h.user)).filter(Boolean);
      if (helperRooms.length > 0) {
        io.to(helperRooms).emit("request:cancelled", { _id: request._id, requestId: request.requestId });
      }
    }
  } catch (err) {
    // socket server not ready — ignore
  }

  await BloodRequest.deleteMany({ requestedBy: userId });

  // 2) Requests this user had accepted: take them off; an open request left with
  //    nobody goes back to "Open" (Finding Donors)
  const accepted = await BloodRequest.find({ "helpers.user": userId }).select("_id");
  const acceptedIds = accepted.map((r) => r._id);
  await BloodRequest.updateMany({ "helpers.user": userId }, { $pull: { helpers: { user: userId } } });
  if (acceptedIds.length > 0) {
    await BloodRequest.updateMany(
      { _id: { $in: acceptedIds }, status: "Accepted", helpers: { $size: 0 } },
      { $set: { status: "Open" } }
    );
  }

  // 3) Donation history and chats
  await Donation.deleteMany({ donor: userId });

  const conversations = await Conversation.find({ participants: userId }).select("_id");
  const conversationIds = conversations.map((c) => c._id);
  if (conversationIds.length > 0) {
    await Message.deleteMany({ conversation: { $in: conversationIds } });
    await Conversation.deleteMany({ _id: { $in: conversationIds } });
  }

  // 4) The account itself
  await User.deleteOne({ _id: userId });

  // Close any sockets this user still has open (other tabs / devices)
  try {
    getIO().in(String(userId)).disconnectSockets(true);
  } catch (err) {
    // ignore
  }

  res.status(200).json({ success: true, message: "Your account has been deleted" });
});
