import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/e/$id")({
  component: OldPassport,
});

function OldPassport() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ to: "/open/$id", params: { id }, replace: true });
  }, [id, navigate]);
  return <p className="px-3 pt-6 text-sm text-muted">Відкриваю стіну…</p>;
}
