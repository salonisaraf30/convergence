import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  // Note: Use port 3001 (via npm scripts) to avoid conflict with SpacetimeDB on port 3000
};

export default nextConfig;
