// CLIENT_URL = the website address(es) allowed to talk to this API (CORS + socket.io).
// One or several, comma separated:
//   CLIENT_URL=https://bloodsevajabalpur.in,https://www.bloodsevajabalpur.in
const clean = (url) => url.trim().replace(/\/+$/, "");

export const allowedOrigins = () =>
  (process.env.CLIENT_URL || "http://localhost:5173").split(",").map(clean).filter(Boolean);

// `origin` option for both `cors()` and `new Server()` (socket.io)
export function corsOrigin(origin, callback) {
  if (!origin) return callback(null, true); // health checks, curl, server-to-server: no Origin header
  return callback(null, allowedOrigins().includes(clean(origin)));
}
