import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  async redirects() {
    return [
      { source: "/login", destination: "/?auth=login", permanent: false },
      { source: "/register", destination: "/?auth=register", permanent: false },
    ];
  },
};

export default nextConfig;
