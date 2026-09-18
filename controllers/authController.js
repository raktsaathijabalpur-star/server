import asyncHandler from "express-async-handler";
import User, { ROLE_ENUM } from "../models/User.js";
import generateToken from "../utils/generateToken.js";

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

// Fields where an empty string from a form should be stored as "no value"
const NULLABLE_FIELDS = ["dateOfBirth", "lastDonationDate", "gender"];

// @desc  Update profile / availability / donor onboarding details
// @route PUT /api/auth/me
// @access Private
export const updateMe = asyncHandler(async (req, res) => {
  const allowedFields = [
    "name",
    "email",
    "city",
    "state",
    "area",
    "pincode",
    "preferredArea",
    "bloodGroup",
    "availableToDonate",
    "lastDonationDate",
    "dateOfBirth",
    "gender",
    "avatarUrl",
  ];

  allowedFields.forEach((field) => {
    if (req.body[field] === undefined) return;
    const value = req.body[field];
    req.user[field] = NULLABLE_FIELDS.includes(field) && value === "" ? null : value;
  });

  const updatedUser = await req.user.save();

  res.status(200).json({
    success: true,
    user: updatedUser.toPublicJSON(),
  });
});
