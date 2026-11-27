import type { MetadataRoute } from "next"

// What a phone needs to add Ask to its Home Screen as an app of its own. On an iPhone, only then can Ask show
// notifications. The colours are the calm week's page; the icons are drawn by app/icon.tsx.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ask",
    short_name: "Ask",
    description: "A command bar assistant for your reminders.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#eef0f3",
    theme_color: "#eef0f3",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png" },
      { src: "/icon/512", sizes: "512x512", type: "image/png" },
    ],
  }
}
