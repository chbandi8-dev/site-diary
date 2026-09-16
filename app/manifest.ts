import type { MetadataRoute } from "next";

/**
 * Makes the site installable on his phone.
 *
 * Not an App Store app, deliberately. This gives the part that matters — a home
 * screen icon and a full-screen window with no browser chrome — without a
 * second codebase, two developer accounts, or a review queue between him and a
 * fix. Owners are never asked to install anything; their side stays a link.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Site Diary",
    short_name: "Site Diary",
    description: "Keep every homeowner up to date, in about thirty seconds a house.",
    // Opens on the run sheet rather than the marketing site — the home screen
    // icon is his, and the public site is not what he opens it for.
    start_url: "/admin/houses",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#1C1C1E",
    theme_color: "#1C1C1E",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android crops icons to its own shape; the maskable one is inset so the
      // roof line survives a circle.
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Today", short_name: "Today", url: "/admin" },
      { name: "From owners", short_name: "Owners", url: "/admin/reports" },
    ],
  };
}
