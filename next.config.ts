import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // AVIF primero: los dos logos de marca son planos y comprimen muy bien,
    // y esta landing se sirve sobre la red de un mall.
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
