/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_COORD_HTTP: process.env.NEXT_PUBLIC_COORD_HTTP || 'http://127.0.0.1:49152',
    NEXT_PUBLIC_COORD_WS:   process.env.NEXT_PUBLIC_COORD_WS   || 'ws://127.0.0.1:49152/ws',
  },
};
module.exports = nextConfig;
