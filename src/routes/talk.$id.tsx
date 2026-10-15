import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/talk/$id")({
  validateSearch: (search: Record<string, unknown>) => ({
    deal: search.deal === true || search.deal === 1 || search.deal === "1" || search.deal === "true",
  }),
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/open/$id", params: { id: params.id } });
  },
});
