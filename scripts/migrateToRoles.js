// One-time migration for data created BEFORE roles / request IDs existed.
//
//   cd backend
//   node scripts/migrateToRoles.js
//
// Safe to run more than once — it only touches documents that need fixing.
import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "../models/User.js";
import BloodRequest from "../models/BloodRequest.js";
import generateRequestId from "../utils/generateRequestId.js";

dotenv.config();

const URGENCY_RANK = { Emergency: 0, Urgent: 1, Normal: 2 };

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected.");

  // 1) Users created before roles existed -> donors
  const users = await User.updateMany({ role: { $exists: false } }, { $set: { role: "donor" } });
  console.log(`Users given role "donor": ${users.modifiedCount}`);

  // 2) Requests: unique requestId (oldest first, so numbers follow creation order)
  const missingId = await BloodRequest.find({ requestId: { $exists: false } })
    .sort({ createdAt: 1 })
    .select("_id");
  for (const doc of missingId) {
    const requestId = await generateRequestId();
    await BloodRequest.updateOne({ _id: doc._id }, { $set: { requestId } });
  }
  console.log(`Requests given a requestId: ${missingId.length}`);

  // 3) Requests: urgencyRank (used for sorting)
  for (const [urgency, rank] of Object.entries(URGENCY_RANK)) {
    await BloodRequest.updateMany({ urgency }, { $set: { urgencyRank: rank } });
  }
  console.log("urgencyRank updated.");

  // 4) Requests that already had helpers were effectively "accepted"
  const accepted = await BloodRequest.updateMany(
    { status: "Open", "helpers.0": { $exists: true } },
    { $set: { status: "Accepted" } }
  );
  console.log(`Open requests with helpers -> Accepted: ${accepted.modifiedCount}`);

  await mongoose.disconnect();
  console.log("Done.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
