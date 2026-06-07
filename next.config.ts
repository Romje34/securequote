import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/test-members", destination: "/dashboard", permanent: true },
      { source: "/test-companies", destination: "/companies", permanent: true },
      { source: "/test-login", destination: "/login", permanent: true },
    ]
  },
};

export default nextConfig;
