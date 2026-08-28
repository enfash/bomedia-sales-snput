/** @type {import('next').NextConfig} */
const nextConfig = {
  // `next build` and `next dev` both write to .next by default, so running a
  // build while the dev server is up overwrites the manifests it is reading:
  // in-flight requests abort with "Failed to fetch" and route handlers briefly
  // 404. Setting NEXT_DIST_DIR sends a verification build somewhere harmless.
  // Unset — the normal case, including deploys — this is exactly the default.
  distDir: process.env.NEXT_DIST_DIR || '.next',

  // Lets the dev server's hot-reload websocket connect when the app is opened
  // from another device on the LAN (e.g. testing on a phone) instead of
  // localhost. Without this, the page still works — only live-reload-on-save
  // is blocked, logged as repeated "WebSocket connection ... failed" errors.
  allowedDevOrigins: ['192.168.0.123', '192.168.100.30'],
};

export default nextConfig;
