import { createClient } from "@/lib/supabase/server";
import RunScrapeButton from "./RunScrapeButton";

export const dynamic = "force-dynamic";

type Job = {
  id: string;
  job_type: string;
  status: "running" | "success" | "partial" | "failed";
  items_found: number;
  items_new: number;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
  store: { name: string } | null;
};

const STATUS_STYLE: Record<Job["status"], string> = {
  running: "bg-blue-900/50 text-blue-300",
  success: "bg-green-900/50 text-green-300",
  partial: "bg-amber-900/50 text-amber-300",
  failed: "bg-red-900/50 text-red-300",
};

function fmt(dt: string | null): string {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default async function ColetaPage() {
  const supabase = await createClient();

  const [{ data: storesData }, { data: jobsData }] = await Promise.all([
    supabase.from("stores").select("id, name, platform").not("platform", "is", null),
    supabase
      .from("ingestion_jobs")
      .select("*, store:stores ( name )")
      .order("started_at", { ascending: false })
      .limit(20),
  ]);

  const scraperStores = (storesData ?? []) as { id: string; name: string; platform: string }[];
  const jobs = (jobsData ?? []) as unknown as Job[];

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">Coleta</h1>

      <section className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-900 p-5">
        <div>
          <h2 className="font-medium">Rodar coleta manual</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Dispara o scraper no GitHub Actions para todas as lojas com scraper configurado. O
            resultado aparece no histórico abaixo em cerca de 1 minuto.
          </p>
        </div>

        <RunScrapeButton />

        <div className="border-t border-neutral-800 pt-3 text-sm">
          <p className="text-neutral-400">
            Lojas incluídas na coleta ({scraperStores.length}):
          </p>
          {scraperStores.length === 0 ? (
            <p className="mt-1 text-neutral-600">
              Nenhuma. Defina a &quot;Coleta automática&quot; em alguma loja para incluí-la.
            </p>
          ) : (
            <ul className="mt-1 list-inside list-disc text-neutral-300">
              {scraperStores.map((s) => (
                <li key={s.id}>
                  {s.name} <span className="text-neutral-600">({s.platform})</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Últimas execuções</h2>
        <div className="overflow-hidden rounded-lg border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900 text-left text-neutral-400">
              <tr>
                <th className="px-4 py-2 font-medium">Loja</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Ofertas</th>
                <th className="px-4 py-2 font-medium">Novos</th>
                <th className="px-4 py-2 font-medium">Início</th>
                <th className="px-4 py-2 font-medium">Fim</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-neutral-500">
                    Nenhuma coleta executada ainda.
                  </td>
                </tr>
              )}
              {jobs.map((j) => (
                <tr key={j.id} className="border-t border-neutral-800 align-top">
                  <td className="px-4 py-2">{j.store?.name ?? "—"}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[j.status]}`}>
                      {j.status}
                    </span>
                    {j.error_message && (
                      <div className="mt-1 max-w-xs text-xs text-red-400">{j.error_message}</div>
                    )}
                  </td>
                  <td className="px-4 py-2">{j.items_found}</td>
                  <td className="px-4 py-2">{j.items_new}</td>
                  <td className="px-4 py-2 text-neutral-400">{fmt(j.started_at)}</td>
                  <td className="px-4 py-2 text-neutral-400">{fmt(j.finished_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
