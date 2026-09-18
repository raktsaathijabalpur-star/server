import Counter from "../models/Counter.js";

// Returns the next unique request ID for the current year: REQ-2026-000124
// Uses an atomic $inc on a counter document, so two requests created at the
// same moment can never receive the same number (and deleting a request
// never causes a number to be reused, unlike countDocuments()).
export default async function generateRequestId() {
  const year = new Date().getFullYear();
  const counter = await Counter.findOneAndUpdate(
    { _id: `request-${year}` },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `REQ-${year}-${String(counter.seq).padStart(6, "0")}`;
}
