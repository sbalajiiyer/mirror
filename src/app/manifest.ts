import type { MetadataRoute } from "next";

/** Lets people add Mirror to their home screen (Phase 10). No offline mode. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mirror — 360° feedback",
    short_name: "Mirror",
    description: "Run credible, anonymous 360° feedback on yourself and see how others experience you.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#4338ca",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
