/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    CAFE24_MALL_ID: 'sopexkorea',
    NEXT_PUBLIC_CAFE24_CLIENT_ID: process.env.NEXT_PUBLIC_CAFE24_CLIENT_ID || 'your_client_id',
    NEXT_PUBLIC_CAFE24_CLIENT_SECRET: process.env.NEXT_PUBLIC_CAFE24_CLIENT_SECRET || 'your_client_secret',
    NEXT_PUBLIC_CAFE24_REDIRECT_URI: process.env.NEXT_PUBLIC_CAFE24_REDIRECT_URI || 'http://localhost:3000/api/auth/callback',
  },
}

module.exports = nextConfig 