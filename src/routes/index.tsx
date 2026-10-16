import { createFileRoute } from "@tanstack/react-router";
import { OrbitApp } from "@/components/orbit/app";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Орбіти" },
      { name: "description", content: "Вісім мільйонів рівних орбіт. Одна ціна. Внутрішня одиниця — іскра ✦. Запускаємо разом." },
      { name: "theme-color", content: "#05060a" },
    ],
  }),
  component: OrbitApp,
});
