/** @type {import('next').NextConfig} */
const nextConfig = {
  // Increase body size limit for chunked uploads (up to 50MB)
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
};

module.exports = nextConfig;
