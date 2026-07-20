import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

async function count(table: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase.from(table).select("*", { count: "exact", head: true });
  return count ?? 0;
}

export default async function AdminHome() {
  const [lojas, produtos, ofertas] = await Promise.all([
    count("stores"),
    count("products"),
    count("offers"),
  ]);

  const cards = [
    { href: "/admin/lojas", label: "Lojas", value: lojas },
    { href: "/admin/produtos", label: "Produtos", value: produtos },
    { href: "/admin/ofertas", label: "Ofertas", value: ofertas },
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">Painel</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-lg border border-neutral-800 bg-neutral-900 p-5 hover:border-neutral-700"
          >
            <div className="text-3xl font-semibold">{c.value}</div>
            <div className="mt-1 text-sm text-neutral-400">{c.label}</div>
          </Link>
        ))}
      </div>

      <p className="text-sm text-neutral-500">
        Cadastre lojas, depois produtos e ofertas. As ofertas alimentam o catálogo público e o
        histórico de preço.
      </p>
    </div>
  );
}
