import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Store } from "@/lib/types";
import { saveStore, deleteStore } from "./actions";

export const dynamic = "force-dynamic";

export default async function LojasPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const { edit } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("stores").select("*").order("name");
  const stores = (data ?? []) as Store[];
  const editing = edit ? stores.find((s) => s.id === edit) : undefined;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Lojas</h1>
      </div>

      <form
        action={saveStore}
        className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-900 p-5"
      >
        <h2 className="font-medium">{editing ? "Editar loja" : "Nova loja"}</h2>
        {editing && <input type="hidden" name="id" value={editing.id} />}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm text-neutral-400">Nome *</span>
            <input
              name="name"
              required
              defaultValue={editing?.name ?? ""}
              className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2"
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm text-neutral-400">
              URL de listagem (pra coleta)
            </span>
            <input
              name="site_url"
              type="url"
              placeholder="https://loja.com/cervejas?pagina=1"
              defaultValue={editing?.site_url ?? ""}
              className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2"
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm text-neutral-400">
              Scraper (opcional)
            </span>
            <input
              name="scraper_key"
              placeholder="ex: clubedomalte"
              defaultValue={editing?.scraper_key ?? ""}
              className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2"
            />
            <span className="text-xs text-neutral-600">
              Deixe vazio para lojas só de cadastro manual. Preencha com a chave do scraper
              (ex: <code>clubedomalte</code>) para incluir na coleta automática.
            </span>
          </label>
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-amber-500"
          >
            {editing ? "Salvar" : "Adicionar"}
          </button>
          {editing && (
            <Link
              href="/admin/lojas"
              className="rounded border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
            >
              Cancelar
            </Link>
          )}
        </div>
      </form>

      <div className="overflow-hidden rounded-lg border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900 text-left text-neutral-400">
            <tr>
              <th className="px-4 py-2 font-medium">Nome</th>
              <th className="px-4 py-2 font-medium">Site</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {stores.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-neutral-500">
                  Nenhuma loja cadastrada ainda.
                </td>
              </tr>
            )}
            {stores.map((s) => (
              <tr key={s.id} className="border-t border-neutral-800">
                <td className="px-4 py-2">{s.name}</td>
                <td className="px-4 py-2 text-neutral-400">
                  {s.site_url ? (
                    <a href={s.site_url} target="_blank" rel="noopener noreferrer" className="hover:text-neutral-100">
                      {s.site_url}
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <Link
                      href={`/admin/lojas?edit=${s.id}`}
                      className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
                    >
                      Editar
                    </Link>
                    <form action={deleteStore}>
                      <input type="hidden" name="id" value={s.id} />
                      <button
                        type="submit"
                        className="rounded border border-red-900 px-2 py-1 text-xs text-red-300 hover:bg-red-950"
                      >
                        Excluir
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
