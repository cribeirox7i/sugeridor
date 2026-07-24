import { Link } from "@/i18n/navigation";

// Layout compartilhado pras páginas institucionais (/sobre, /termos) — texto
// corrido simples, com quebras de parágrafo (\n\n) vindas das mensagens.
export default function InstitutionalPage({
  title,
  body,
  backLabel,
}: {
  title: string;
  body: string;
  backLabel: string;
}) {
  const paragraphs = body.split("\n\n");

  return (
    <div className="min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="border-b border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto max-w-3xl px-6 py-4">
          <Link
            href="/"
            className="text-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            {backLabel}
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-4 px-6 py-10">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {paragraphs.map((p, i) => (
          <p key={i} className="leading-relaxed text-neutral-700 dark:text-neutral-300">
            {p}
          </p>
        ))}
      </div>
    </div>
  );
}
