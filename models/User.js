import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const ROLES = ["donor", "patient"];

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      unique: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false,
    },
    // "donor"   -> Donate Blood flow (sees requests, can accept them)
    // "patient" -> Need Blood flow (creates requests, tracks them)
    role: {
      type: String,
      enum: ROLES,
      default: "donor",
    },
    bloodGroup: {
      type: String,
      enum: BLOOD_GROUPS,
      required: [true, "Blood group is required"],
    },
    city: {
      type: String,
      default: "Jabalpur",
      trim: true,
    },
    state: {
      type: String,
      trim: true,
    },
    area: {
      type: String,
      trim: true,
    },
    pincode: {
      type: String,
      trim: true,
    },
    // Donor onboarding: "Preferred Donation Area"
    preferredArea: {
      type: String,
      trim: true,
      default: "",
    },
    dateOfBirth: {
      type: Date,
      default: null,
    },
    gender: {
      type: String,
      enum: ["Male", "Female", "Other", null],
      default: null,
    },
    availableToDonate: {
      type: Boolean,
      default: true,
    },
    lastDonationDate: {
      type: Date,
      default: null,
    },
    donationsCount: {
      type: Number,
      default: 0,
    },
    livesHelped: {
      type: Number,
      default: 0,
    },
    // Small profile photo stored as a data URL (the frontend shrinks it to
    // ~160px first). For production, move this to Cloudinary / S3 and store the URL.
    avatarUrl: {
      type: String,
      default: "",
    },
    // Can open "Verify Donations". Set only from the database / scripts/makeAdmin.js —
    // no API route ever accepts this field.
    isAdmin: {
      type: Boolean,
      default: false,
    },
    // Profile -> Privacy Settings (donors)
    privacy: {
      showOnLeaderboard: { type: Boolean, default: true }, // appear on Top Donors
      showInMatches: { type: Boolean, default: true }, // appear in a patient's "Matching Donors"
    },
    // Profile -> Notifications (in-app pop-ups)
    notificationPrefs: {
      newRequests: { type: Boolean, default: true },
      requestUpdates: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

userSchema.index({ role: 1, bloodGroup: 1, availableToDonate: 1 });

userSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: this._id,
    _id: this._id, // same value: lets code written as user._id (e.g. chat) work too
    name: this.name,
    email: this.email,
    phone: this.phone,
    role: this.role,
    bloodGroup: this.bloodGroup,
    city: this.city,
    state: this.state,
    area: this.area,
    pincode: this.pincode,
    preferredArea: this.preferredArea,
    dateOfBirth: this.dateOfBirth,
    gender: this.gender,
    availableToDonate: this.availableToDonate,
    lastDonationDate: this.lastDonationDate,
    donationsCount: this.donationsCount,
    livesHelped: this.livesHelped,
    avatarUrl: this.avatarUrl,
    isAdmin: this.isAdmin === true,
    privacy: {
      showOnLeaderboard: this.privacy?.showOnLeaderboard ?? true,
      showInMatches: this.privacy?.showInMatches ?? true,
    },
    notificationPrefs: {
      newRequests: this.notificationPrefs?.newRequests ?? true,
      requestUpdates: this.notificationPrefs?.requestUpdates ?? true,
    },
  };
};

export const BLOOD_GROUP_ENUM = BLOOD_GROUPS;
export const ROLE_ENUM = ROLES;
export default mongoose.model("User", userSchema);
