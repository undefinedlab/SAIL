/** Deployed SAIL API (Railway). Override for a local backend: SAIL_API_PROXY_TARGET=http://localhost:3001 */
const DEFAULT_SAIL_API_PROXY_TARGET = "https://sail-production-50ff.up.railway.app";

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const target = process.env.SAIL_API_PROXY_TARGET ?? DEFAULT_SAIL_API_PROXY_TARGET;
    return [
      { source: "/api/:path*", destination: `${target}/api/:path*` },
      { source: "/health", destination: `${target}/health` },
    ];
  },
};

export default nextConfig;
