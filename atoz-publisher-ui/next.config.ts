import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Parent repo has its own package-lock; pin Turbopack root to this app.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
