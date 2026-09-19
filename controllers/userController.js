import mongoose from "mongoose";
import User from "../models/User.js";
import { withAvatarUrls } from "../utils/avatarUrl.js";

export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.user._id } })
      .select("name bloodGroup city")
      .sort({ name: 1 })
      .lean();

    res.json({ users: await withAvatarUrls(users) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch users" });
  }
};

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

// GET /api/users/:id/avatar — public on purpose: an <img> tag can't send the login token.
// Only the profile photo is served (never other user data), and only safe image types.
export const getUserAvatar = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(404).end();

    const user = await User.findById(id).select("avatarUrl").lean();
    const url = user?.avatarUrl ?? "";
    if (!url) return res.status(404).end();

    if (/^https:\/\/\S+$/.test(url)) return res.redirect(url);

    const match = DATA_URL.exec(url);
    if (!match) return res.status(404).end();

    res.set({
      "Content-Type": match[1],
      "Cache-Control": "public, max-age=86400", // the ?v= in the URL changes when the photo changes
      "X-Content-Type-Options": "nosniff",
    });
    return res.send(Buffer.from(match[2], "base64"));
  } catch (err) {
    console.error(err);
    return res.status(500).end();
  }
};
