import { createFileRoute } from "@tanstack/react-router";
import { PublicDoc } from "@/components/orbit/public-doc";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Орбіти · Політика конфіденційності" }, { name: "description", content: "Орбіти — Політика конфіденційності" }] }),
  component: () => <PublicDoc id="privacy" />,
});
