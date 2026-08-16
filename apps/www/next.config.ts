import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@openhelpdesk/ui", "@openhelpdesk/config"],
};

export default nextConfig;
