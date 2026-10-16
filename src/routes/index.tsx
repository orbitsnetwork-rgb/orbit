import { createFileRoute } from "@tanstack/react-router";
import { OrbitApp } from "@/components/orbit/app";
import { launchPreview, previewMeta } from "@/lib/orbit/share";

export const Route = createFileRoute("/")({
  // Інші параметри (?topup=…) лишаються як є; читаємо тільки c для прев’ю.
  validateSearch: (search: Record<string, unknown>) => search as { c?: string | number },
  // Роутер читає «?c=123456» як число — повертаємо рядок (коди рушія завжди 6-значні, без нуля попереду).
  loaderDeps: ({ search }) => ({ c: search.c === undefined || search.c === null ? "" : String(search.c) }),
  loader: ({ deps }) => launchPreview({ data: { c: deps.c } }),
  head: ({ loaderData }) => ({
    meta: [...previewMeta(loaderData), { name: "theme-color", content: "#05060a" }],
  }),
  component: OrbitApp,
});
