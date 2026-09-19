import jwt from "jsonwebtoken";
import asyncHandler from "express-async-handler";
import User from "../models/User.js";

export const protect = asyncHandler(async (req, res, next) => {
  let token;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  }

  if (!token) {
    res.status(401);
    throw new Error("Not authorized, no token provided");
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) {
      res.status(401);
      throw new Error("Not authorized, user not found");
    }
    req.user = user;
    next();
  } catch (error) {
    res.status(401);
    throw new Error("Not authorized, token invalid or expired");
  }
});

// Usage: router.post("/", protect, requireRole("patient"), handler)
export const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      res.status(403);
      return next(new Error(`Only ${roles.join(" / ")} accounts can do this`));
    }
    next();
  };

// Usage: router.use(protect, requireAdmin). 403 (not 401): the frontend logs the user out on a 401.
export const requireAdmin = (req, res, next) => {
  if (req.user?.isAdmin !== true) {
    res.status(403);
    return next(new Error("Admin access only"));
  }
  next();
};
