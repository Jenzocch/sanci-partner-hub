import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SANCI Partner Hub",
    short_name: "SANCI",
    description: "Kolaborasi SANCI dengan toko furnitur mitra",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f5f7",
    theme_color: "#14171c",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
