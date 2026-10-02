import type { NextConfig } from "next";

const MANAGER_ROUTES = [
  "discover", "leads", "campaigns", "call-queue", "templates",
  "categories", "analytics", "settings", "admin",
];

const nextConfig: NextConfig = {
  async redirects() {
    return [
      ...MANAGER_ROUTES.flatMap((r) => [
        { source: `/${r}`, destination: `/app/${r}`, permanent: true },
        { source: `/${r}/:path*`, destination: `/app/${r}/:path*`, permanent: true },
      ]),
      { source: "/contact", destination: "/start", permanent: true },
    ];
  },
};

export default nextConfig;
