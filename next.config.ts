import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the original site's URL shape (/grammar-points/a1/lesson/).
  trailingSlash: true,
  async redirects() {
    // Old paginated exercise URLs (/lesson/2/) now live in tabs on the lesson page.
    return [{ source: "/:section/:level/:slug/:n(\\d+)/", destination: "/:section/:level/:slug/", permanent: true }];
  },
};

export default nextConfig;
