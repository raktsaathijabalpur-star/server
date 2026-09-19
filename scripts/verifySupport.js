// Confirm (or reject) contributions people reported from Profile -> "I've Donated".
// A contribution appears on the Supporters page only after it is verified.
//
//   cd backend
//   node scripts/verifySupport.js                  -> list pending contributions
//   node scripts/verifySupport.js <id>             -> mark one as verified (money received)
//   node scripts/verifySupport.js <id> reject      -> mark one as rejected (money not received)
import dotenv from "dotenv";
import mongoose from "mongoose";
import Support from "../models/Support.js";
import User from "../models/User.js"; // registers the model used by populate("user")

dotenv.config();

const [, , id, action] = process.argv;

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  if (!id) {
    const pending = await Support.find({ status: "pending" }).sort({ createdAt: 1 }).populate("user", "name phone");
    if (pending.length === 0) console.log("Nothing pending.");
    for (const s of pending) {
      console.log(
        `${s._id}  ₹${s.amount}  ${s.method}  ${s.createdAt.toISOString().slice(0, 16).replace("T", " ")}  ` +
          `${s.user?.name ?? "(deleted user)"} ${s.user?.phone ?? ""}`
      );
    }
    console.log("\nTo confirm one:  node scripts/verifySupport.js <id>");
  } else {
    if (!mongoose.isValidObjectId(id)) throw new Error("That is not a valid id");
    const status = action === "reject" ? "rejected" : "verified";
    const updated = await Support.findByIdAndUpdate(id, { $set: { status } }, { new: true });
    console.log(updated ? `₹${updated.amount} -> ${status}` : "No contribution with that id.");
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
