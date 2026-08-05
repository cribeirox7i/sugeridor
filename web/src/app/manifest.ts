import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sugeridor",
    short_name: "Sugeridor",
    description: "Hub de ofertas de cervejas artesanais e especiais.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#b3151a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
