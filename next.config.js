/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    CAFE24_MALL_ID: 'sopexkorea',
    CAFE24_CLIENT_ID: process.env.CAFE24_CLIENT_ID || 'your_client_id',
    CAFE24_CLIENT_SECRET: process.env.CAFE24_CLIENT_SECRET || 'your_client_secret',
    CAFE24_REDIRECT_URI: process.env.CAFE24_REDIRECT_URI || 'http://localhost:3000',
  },
}

module.exports = nextConfig 