import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@openhelpdesk/ui",
    "@openhelpdesk/ee-web",
    "@openhelpdesk/config",
    "@openhelpdesk/crypto",
    "@openhelpdesk/db",
    "@openhelpdesk/auth",
    "@openhelpdesk/mail",
    "@openhelpdesk/rules",
  ],
  // postgres.js et better-auth restent côté Node.
  serverExternalPackages: ["postgres", "nodemailer", "bullmq", "ioredis"],
};

export default nextConfig;
