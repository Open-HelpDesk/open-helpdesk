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
  experimental: {
    /**
     * Attachments travel through a Server Action, and that body defaults to 1 MB
     * — so the 10 MB per file the product announces (MAX_ATTACHMENT_BYTES) was
     * unreachable: two screenshots and the reply died on a 413 rendered as
     * "Application error", losing what the agent had just written. The ceiling
     * here is the per-message one; the per-file check stays in storage.ts, and
     * the composer refuses beyond it rather than letting the request fail.
     */
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
