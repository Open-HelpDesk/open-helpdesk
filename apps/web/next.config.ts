import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Image Docker : `NEXT_OUTPUT=standalone pnpm build` produit .next/standalone
  // (serveur autonome tracé sur tout le monorepo). Sans la variable, build
  // classique — `next start` et la suite smoke restent inchangés.
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
  // postgres.js et better-auth restent côté Node.
  serverExternalPackages: ["postgres", "nodemailer", "bullmq", "ioredis"],
};

export default nextConfig;
