import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/people/$name")({
  beforeLoad: () => {
    throw redirect({ to: "/activity" });
  },
});
