import { createFileRoute } from "@tanstack/react-router";
import { PublicDoc } from "@/components/orbit/public-doc";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Орбіти · Умови користування" }, { name: "description", content: "Орбіти — Умови користування" }] }),
  component: () => <PublicDoc id="terms" />,
});
