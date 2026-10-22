/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse", "@prisma/client", "@prisma/adapter-pg", "pg", "bullmq", "ioredis", "googleapis"],
  },
  webpack: (config) => {
    // pdfjs-dist optionally requires 'canvas' in Node — not needed in the browser.
    config.resolve.alias.canvas = false;
    return config;
  },
  async headers() {
    return [
      {
        source: "/uploads/:path*",
        headers: [{ key: "Cache-Control", value: "private, max-age=3600" }],
      },
    ];
  },
};
export default nextConfig;
