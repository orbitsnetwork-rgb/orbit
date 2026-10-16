import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "Екран не встиг зібратися.";
}

export function AppErrorComponent({ error, reset }: ErrorComponentProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto grid max-w-lg justify-items-center gap-3 px-3 pt-16 pb-[calc(6rem+env(safe-area-inset-bottom))] text-center">
      <TriangleAlert className="text-accent" size={28} strokeWidth={1.5} />
      <h1 className="text-h2">Цей екран не відкрився</h1>
      <p className="max-w-sm text-sm break-words text-muted">Щось пішло не так у самому застосунку. Твої іскри й орбіти в безпеці.</p>
      {import.meta.env.DEV ? <p className="max-w-sm text-xs break-words text-muted">{errorMessage(error)}</p> : null}
      <button type="button" className="h-11 w-full max-w-xs rounded-full bg-accent text-sm text-bg" onClick={() => reset()}>
        Спробувати ще
      </button>
      <a href="/" className="text-sm text-muted">На головну</a>
    </div>
  );
}
