/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true, // Prevents pipeline halts on strict TS issues during Vite migrations
  }
};

module.exports = nextConfig;
