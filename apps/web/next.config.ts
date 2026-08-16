import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@openhelpdesk/ui",
    "@openhelpdesk/config",
    "@openhelpdesk/db",
    "@openhelpdesk/auth",
    "@openhelpdesk/mail",
    "@openhelpdesk/rules",
  ],
  // postgres.js et better-auth restent côté Node.
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
