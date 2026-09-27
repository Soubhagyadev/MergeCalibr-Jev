import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep these packages server-side only — prevents any accidental client bundle inclusion.
  serverExternalPackages: ["@octokit/rest"],

  // Explicitly block any env var from being inlined into the client bundle.
  // Only NEXT_PUBLIC_ vars are ever exposed; none are defined in this project.
  // This is the default Next.js behavior, stated here for clarity.
  env: {},
};

export default nextConfig;
