/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const target = process.env.SAIL_API_PROXY_TARGET ?? "http://localhost:3001";
    return [
      { source: "/api/:path*", destination: `${target}/api/:path*` },
      { source: "/health", destination: `${target}/health` },
    ];
  },
};

export default nextConfig;
