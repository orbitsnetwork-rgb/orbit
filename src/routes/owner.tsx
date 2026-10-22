import { createFileRoute } from "@tanstack/react-router";
import { OwnerPage } from "@/components/orbit/owner";

/** Сторінка власника. Не індексується; доступ перевіряє сервер за ORBIT_ADMIN_TOKEN. */
export const Route = createFileRoute("/owner")({
  head: () => ({ meta: [{ title: "Орбіти · Власник" }, { name: "robots", content: "noindex, nofollow" }, { name: "referrer", content: "no-referrer" }] }),
  component: OwnerPage,
});
