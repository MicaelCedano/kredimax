import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1"],
  experimental: { serverActions: { bodySizeLimit: "9mb" } },
};

export default nextConfig;
