import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/discover")({
  component: DiscoverRedirect,
});

function DiscoverRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ to: "/map", replace: true });
  }, [navigate]);
  return <p className="px-3 pt-6 text-sm text-muted">Відкриваю стіни поруч…</p>;
}
