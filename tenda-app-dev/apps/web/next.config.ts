import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16's persistent Turbopack cache grew to 6.6 GB and drove the dev
  // server above 6 GB RSS in this workspace. Keep Turbopack/HMR, but disable
  // only its development disk cache; production builds are unchanged.
  experimental: { turbopackFileSystemCacheForDev: false },
};

export default nextConfig;
