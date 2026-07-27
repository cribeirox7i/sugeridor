"use server";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/slug";
import { revalidateAllLocales } from "@/lib/revalidate";
import { normalizeDashes, titleCaseProductName } from "@/lib/text";
import type { AttributeSchema, ProductType } from "@/lib/types";

export async function saveProduct(formData: FormData) {
  const id = (formData.get("id") as string) || null;
  const product_type_id = formData.get("product_type_id") as string;
  const name = titleCaseProductName(normalizeDashes((formData.get("name") as string)?.trim() ?? ""));
  const brandRaw = ((formData.get("brand") as string) || "").trim();
  const brand = brandRaw ? normalizeDashes(brandRaw) : null;
  const image_url = ((formData.get("image_url") as string) || "").trim() || null;
  const category = ((formData.get("category") as string) || "cervejas").trim();

  if (!name || !product_type_id) return;

  const supabase = await createClient();

  // Monta o objeto attributes a partir dos campos definidos no schema do tipo.
  const { data: pt } = await supabase
    .from("product_types")
    .select("attribute_schema")
    .eq("id", product_type_id)
    .maybeSingle();

  const schema = (pt?.attribute_schema ?? { fields: [] }) as AttributeSchema;
  const attributes: Record<string, string | number> = {};
  for (const field of schema.fields) {
    const raw = (formData.get(`attr_${field.key}`) as string | null)?.trim();
    if (!raw) continue;
    attributes[field.key] = field.type === "number" ? Number(raw) : raw;
  }

  let error;
  if (id) {
    ({ error } = await supabase
      .from("products")
      .update({ product_type_id, name, brand, image_url, category, attributes, updated_at: new Date().toISOString() })
      .eq("id", id));
  } else {
    // Slug único: se colidir, sufixa com um trecho aleatório.
    let canonical_slug = slugify(`${brand ?? ""} ${name}`);
    const { data: existing } = await supabase
      .from("products")
      .select("id")
      .eq("canonical_slug", canonical_slug)
      .maybeSingle();
    if (existing) canonical_slug = `${canonical_slug}-${Math.random().toString(36).slice(2, 6)}`;

    ({ error } = await supabase
      .from("products")
      .insert({ product_type_id, name, brand, image_url, category, attributes, canonical_slug }));
  }

  const locale = await getLocale();

  if (error) {
    // Mesmo motivo do fix em lojas: sem checar isso, o modal reabria vazio
    // parecendo "não fez nada" e o usuário clicava de novo, duplicando.
    const qs = id ? `?edit=${id}&error=save-failed` : `?new=1&error=save-failed`;
    redirect(`/${locale}/admin/produtos${qs}`);
  }

  revalidateAllLocales("/admin/produtos");
  revalidateAllLocales("/");
  redirect(`/${locale}/admin/produtos`);
}

export async function deleteProduct(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) return;
  const supabase = await createClient();
  const { error } = await supabase.from("products").delete().eq("id", id);

  if (error) {
    // Mesma proteção de lojas: sem CASCADE de propósito, avisa em vez de
    // falhar silenciosamente quando há oferta vinculada ao produto.
    const locale = await getLocale();
    redirect(`/${locale}/admin/produtos?error=delete-blocked`);
  }

  revalidateAllLocales("/admin/produtos");
  revalidateAllLocales("/");
}

// Lote de upsert pro backfill abaixo — mesma cautela de tamanho de request
// já usada em web/src/lib/queries.ts (batches de ids).
const BACKFILL_BATCH_SIZE = 200;

// Botão único em /admin/produtos: aplica titleCaseProductName aos produtos
// já cadastrados (a maioria em CAIXA ALTA, de antes desse pedido). Idempotente
// — rodar de novo não muda nada em quem já está em Title Case, então não
// precisa de controle de "já rodei antes".
export async function normalizeExistingProductNames(formData: FormData) {
  // `returnTo` permite chamar a mesma ação da tela de Ferramentas sem jogar o
  // usuário de volta pra Produtos. Sanitizado contra open redirect: só aceita
  // uma das telas conhecidas.
  const returnToRaw = (formData?.get("returnTo") as string) || "";
  const returnTo = ["ferramentas", "produtos"].includes(returnToRaw) ? returnToRaw : "produtos";
  const supabase = await createClient();
  const { data } = await supabase.from("products").select("id, name");
  const products = (data ?? []) as { id: string; name: string }[];

  const changed = products
    .map((p) => ({ id: p.id, name: titleCaseProductName(normalizeDashes(p.name)) }))
    .filter((p, i) => p.name !== products[i].name);

  for (let i = 0; i < changed.length; i += BACKFILL_BATCH_SIZE) {
    await supabase.from("products").upsert(changed.slice(i, i + BACKFILL_BATCH_SIZE), {
      onConflict: "id",
    });
  }

  revalidateAllLocales("/admin/produtos");
  revalidateAllLocales("/admin/ferramentas");
  revalidateAllLocales("/");
  const locale = await getLocale();
  redirect(`/${locale}/admin/${returnTo}?normalized=${changed.length}`);
}

// Usado pelo form pra listar os tipos disponíveis.
export async function getProductTypes(): Promise<ProductType[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("product_types").select("*").order("name");
  return (data ?? []) as ProductType[];
}
