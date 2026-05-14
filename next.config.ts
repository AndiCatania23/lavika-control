import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'pub-caae50e77b854437b46967f95fd48914.r2.dev',
        pathname: '/**',
      },
      {
        // Custom domain Cloudflare R2 (vedi memory db-security-hardening
        // + social-manager-state). Usato per le copertine nuove e per gli
        // asset social pubblici.
        protocol: 'https',
        hostname: 'media.lavikasport.app',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
