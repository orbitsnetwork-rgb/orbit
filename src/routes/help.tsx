import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/help")({
  component: HelpPage,
});

const LINES = [
  ["Намалюй", "Вісімка крейдою на справжній стіні. Одне фото з місця."],
  ["Хтось приходить", "Інша людина і інший телефон, ближче ніж 200 м. Свою стіну самому не закрити."],
  ["Обоє маєте по одній", "Ти лишаєшся на стіні. Той, хто прийшов, отримує свою. Номер той самий."],
  ["Передати", "Лише коли стіну вже замкнули. Гроші поза додатком."],
  ["Ключ", "Код показують один раз, у момент, коли стіну замкнули. Немає ключа і коду — повернути не можна."],
  ["Прибрати", "Свою мітку можна зняти, лише поки вона ще чекає."],
];

function HelpPage() {
  return (
    <div className="sheet-page">
      <h1 className="sheet-title">Як це працює</h1>
      <p className="sheet-note">Стіна справжня. Друга людина теж. Намалював. Хтось прийшов. Обоє маєте по одній.</p>
      <div className="sign-list">
        {LINES.map(([title, line]) => (
          <p key={title} className="sign-help">
            <b>{title}</b>
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
