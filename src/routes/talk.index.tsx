import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/talk/")({
  beforeLoad: () => {
    throw redirect({ to: "/activity" });
  },
});
