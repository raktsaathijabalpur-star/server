import User from "../models/User.js";

// Lists of people (chat, matching donors, leaderboard) must not carry every photo as a
// 10 KB base64 string. Instead each person with a photo gets a short URL; the browser
// loads (and caches) the image on demand from GET /api/users/:id/avatar.
export const avatarPath = (id, updatedAt) =>
  `/api/users/${id}/avatar?v=${new Date(updatedAt).getTime() || 0}`;

// list: array of plain objects that have `_id`. Returns copies with `avatarUrl` ("" if no photo).
export async function withAvatarUrls(list) {
  const ids = list.map((u) => u?._id).filter(Boolean);
  if (ids.length === 0) return list;

  // filters on avatarUrl but only reads updatedAt, so no photo data is loaded
  const withPhoto = await User.find({ _id: { $in: ids }, avatarUrl: { $nin: [null, ""] } })
    .select("updatedAt")
    .lean();
  const versions = new Map(withPhoto.map((u) => [String(u._id), u.updatedAt]));

  return list.map((u) => ({
    ...u,
    avatarUrl: versions.has(String(u._id)) ? avatarPath(u._id, versions.get(String(u._id))) : "",
  }));
}
