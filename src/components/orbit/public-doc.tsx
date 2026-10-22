/** Публічна сторінка документа (/privacy, /terms) — для Google OAuth, магазинів застосунків і людей без акаунта. */
import { DOCS, DRAFT_NOTE, EDITION, SUPPORT_MAIL, type DocId } from "@/lib/orbit/docs";

export function PublicDoc({ id }: { id: DocId }) {
  const doc = DOCS[id];
  return (
    <div className="orbit-app">
      <main className="orbit-shell pd-page">
        <a href="/" className="orbit-quiet pd-back">← Орбіти</a>
        <h1>{doc.title}</h1>
        <p className="orbit-note">{EDITION}. {DRAFT_NOTE}</p>
        {doc.sections.map((section) => (
          <section key={section.h} className="mo-sec">
            <h2>{section.h}</h2>
            {section.p.map((line) => (
              <p key={line}>
                {line.split(/(https:\/\/[^\s]+)/).map((part, i) =>
                  /^https:\/\//.test(part) ? (
                    <a key={i} href={part} target="_blank" rel="noopener noreferrer">{part}</a>
                  ) : (
                    part
                  ),
                )}
              </p>
            ))}
          </section>
        ))}
        <p className="orbit-note">Питання: <a href={`mailto:${SUPPORT_MAIL}`}>{SUPPORT_MAIL}</a> · <a href="/privacy">Конфіденційність</a> · <a href="/terms">Умови</a></p>
      </main>
    </div>
  );
}
