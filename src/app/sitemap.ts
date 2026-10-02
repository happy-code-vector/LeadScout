import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  return ["", "/audit", "/results", "/contact"].map((p) => ({
    url: `${base}${p}`,
    lastModified: new Date(),
  }));
}
