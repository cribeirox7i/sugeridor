import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";

async function count(table: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase.from(table).select("*", { count: "exact", head: true });
  return count ?? 0;
}

export default async function AdminHome() {
  const [lojas, produtos, ofertas, t] = await Promise.all([
    count("stores"),
    count("products"),
    count("offers"),
    getTranslations("admin.home"),
  ]);

  const cards = [
    { href: "/admin/lojas", label: t("stores"), value: lojas },
    { href: "/admin/produtos", label: t("products"), value: produtos },
    { href: "/admin/ofertas", label: t("offers"), value: ofertas },
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">{t("title")}</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-lg border border-neutral-200 bg-neutral-50 p-5 hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
          >
            <div className="text-3xl font-semibold">{c.value}</div>
            <div className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{c.label}</div>
          </Link>
        ))}
      </div>

      <p className="text-sm text-neutral-500">{t("hint")}</p>
    </div>
  );
}
