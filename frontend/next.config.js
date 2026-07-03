/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow the backend API URL to be set at build/runtime
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
  },
};

module.exports = nextConfig;
