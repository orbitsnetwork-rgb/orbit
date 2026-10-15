import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/hall")({
  beforeLoad: () => {
    throw redirect({ to: "/activity" });
  },
});
