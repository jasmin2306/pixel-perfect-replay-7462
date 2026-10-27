import { createFileRoute } from "@tanstack/react-router";
import { ChatShell } from "@/components/chat/ChatShell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VisionChat AI — Ask questions about your images" },
      { name: "description", content: "Upload or snap a photo and chat with AI about what's in it." },
      { property: "og:title", content: "VisionChat AI — Ask questions about your images" },
      { property: "og:description", content: "Upload or snap a photo and chat with AI about what's in it." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChatShell,
});
