import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Image Docker : `NEXT_OUTPUT=standalone pnpm build` produit .next/standalone
  // (a standalone server traced over the whole monorepo). Without the variable,
  // a classic build — `next start` and the smoke suite stay unchanged.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
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
  // postgres.js and better-auth stay on the Node side.
  serverExternalPackages: ["postgres", "nodemailer", "bullmq", "ioredis"],
};

export default nextConfig;
