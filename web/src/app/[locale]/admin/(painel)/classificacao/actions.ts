"use server";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { revalidateAllLocales } from "@/lib/revalidate";
import { normalizeDashes } from "@/lib/text";

const CATEGORIES = ["eventos", "kit", "copo", "souvenirs"];

export async function addKeyword(formData: FormData) {
  const category = (formData.get("category") as string) || "";
  const keyword = normalizeDashes(((formData.get("keyword") as string) || "").trim().toLowerCase());
  if (!CATEGORIES.includes(category) || !keyword) return;

  const supabase = await createClient();
  // Duplicata (unique em category+keyword) não é erro pro usuário — a
  // palavra já está classificada nessa categoria, ignora em silêncio.
  await supabase.from("category_keywords").insert({ category, keyword });

  revalidateAllLocales("/admin/classificacao");
}

export async function deleteKeyword(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("category_keywords").delete().eq("id", id);

  revalidateAllLocales("/admin/classificacao");
}

// Lote de linhas por upsert — mesma cautela de tamanho de request usada no
// backfill de nomes (produtos/actions.ts).
const RECLASSIFY_BATCH_SIZE = 200;

// A ordem de prioridade é a mesma fixada em scraper/categorize.py
// (_CATEGORY_ORDER): "Kit Copo + Cerveja" precisa virar 'kit', não 'copo'.
// Só as PALAVRAS são dado editável; a ordem é regra de negócio.
function classify(name: string, keywordsByCategory: Map<string, string[]>): string {
  const haystack = name.toLowerCase();
  for (const category of CATEGORIES) {
    for (const keyword of keywordsByCategory.get(category) ?? []) {
      // Fronteira de palavra pra "bag" não casar dentro de "Bagaço" — mesmo
      // efeito do \b do regex em Python, sem depender de lookbehind.
      const pattern = new RegExp(
        `(^|[^\\p{L}\\p{N}])${keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}\\p{N}]|$)`,
        "u",
      );
      if (pattern.test(haystack)) return category;
    }
  }
  return "cervejas";
}

// Aplica as palavras-chave atuais aos produtos JÁ cadastrados. Sem isso,
// adicionar uma palavra nesta tela só valeria pra produtos futuros — o
// scraper nunca reclassifica produto existente (de propósito, pra não
// sobrescrever curadoria manual), então o catálogo já coletado ficaria
// errado pra sempre. Idempotente: rodar de novo não muda quem já está certo.
export async function reclassifyExistingProducts(formData?: FormData) {
  // `returnTo`: a mesma ação tem dois pontos de entrada — a tela de
  // Classificação (fluxo natural depois de mexer nas palavras) e a de
  // Ferramentas. Sanitizado contra open redirect.
  const returnToRaw = (formData?.get("returnTo") as string) || "";
  const returnTo = ["ferramentas", "classificacao"].includes(returnToRaw)
    ? returnToRaw
    : "classificacao";
  const supabase = await createClient();

  const [{ data: keywordData }, { data: productData }] = await Promise.all([
    supabase.from("category_keywords").select("category, keyword"),
    supabase.from("products").select("id, name, category"),
  ]);

  const keywordsByCategory = new Map<string, string[]>();
  for (const row of (keywordData ?? []) as { category: string; keyword: string }[]) {
    const list = keywordsByCategory.get(row.category);
    if (list) list.push(row.keyword);
    else keywordsByCategory.set(row.category, [row.keyword]);
  }

  const products = (productData ?? []) as { id: string; name: string; category: string }[];
  const changed = products
    .map((p) => ({ id: p.id, category: classify(p.name, keywordsByCategory), was: p.category }))
    .filter((p) => p.category !== p.was)
    .map(({ id, category }) => ({ id, category }));

  for (let i = 0; i < changed.length; i += RECLASSIFY_BATCH_SIZE) {
    await supabase
      .from("products")
      .upsert(changed.slice(i, i + RECLASSIFY_BATCH_SIZE), { onConflict: "id" });
  }

  revalidateAllLocales("/admin/classificacao");
  revalidateAllLocales("/admin/ferramentas");
  revalidateAllLocales("/admin/produtos");
  revalidateAllLocales("/");
  const locale = await getLocale();
  redirect(`/${locale}/admin/${returnTo}?reclassified=${changed.length}`);
}
