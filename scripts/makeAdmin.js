// Give (or take away) admin rights. Admins get "Verify Donations" in the menu.
//
//   cd backend
//   node scripts/makeAdmin.js <phone or user id>            -> make admin
//   node scripts/makeAdmin.js <phone or user id> remove     -> remove admin
//
// Examples:  node scripts/makeAdmin.js 9876543210
//            node scripts/makeAdmin.js 6aad73f13b7bf9904ec0d45f
import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "../models/User.js";

dotenv.config();

const [, , who, action] = process.argv;

async function run() {
  if (!who) throw new Error("Usage: node scripts/makeAdmin.js <phone or user id> [remove]");
  await mongoose.connect(process.env.MONGO_URI);

  const filter = mongoose.isValidObjectId(who) ? { _id: who } : { phone: who.trim() };
  const user = await User.findOneAndUpdate(filter, { $set: { isAdmin: action !== "remove" } }, { new: true });

  console.log(
    user
      ? `${user.name} (${user.phone}) is ${user.isAdmin ? "now an ADMIN" : "no longer an admin"}. Refresh the app to see the change.`
      : "No user found with that phone / id."
  );
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
