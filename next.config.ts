import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'pub-caae50e77b854437b46967f95fd48914.r2.dev',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
