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
    <main className="lp" aria-labelledby="err-title">
      <div className="lp-card">
        <TriangleAlert className="nf-mark" size={36} strokeWidth={1.5} aria-hidden />
        <h1 id="err-title" className="lp-title">Цей екран не відкрився</h1>
        <p className="lp-sub">Щось пішло не так у самому застосунку. Твої іскри й орбіти в безпеці.</p>
        {import.meta.env.DEV ? <p className="lp-sub">{errorMessage(error)}</p> : null}
        <button type="button" className="lp-go" onClick={() => reset()}>
          Спробувати ще
        </button>
        <a href="/" className="orbit-quiet">На головну</a>
      </div>
    </main>
  );
}
