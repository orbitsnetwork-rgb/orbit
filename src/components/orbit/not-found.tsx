import { Link } from "@tanstack/react-router";

/** Будь-яка невідома адреса (зокрема старі сторінки «Восьмої»: /create, /map, /open/… — їх прибрано). */
export function NotFound() {
  return (
    <main className="lp" data-center aria-labelledby="nf-title">
      <div className="lp-card">
        <img src="/favicon.svg" alt="" width={48} height={48} className="nf-mark" />
        <h1 id="nf-title" className="lp-title">Цієї сторінки немає</h1>
        <p className="lp-sub">Можливо, посилання застаріло. Усе, що є в Орбітах, — на головній.</p>
        <Link to="/" className="lp-go">Відкрити Орбіти</Link>
      </div>
    </main>
  );
}
