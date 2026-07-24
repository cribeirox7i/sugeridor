"use server";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/slug";
import { revalidateAllLocales } from "@/lib/revalidate";
import type { AttributeSchema, ProductType } from "@/lib/types";

export async function saveProduct(formData: FormData) {
  const id = (formData.get("id") as string) || null;
  const product_type_id = formData.get("product_type_id") as string;
  const name = (formData.get("name") as string)?.trim();
  const brand = ((formData.get("brand") as string) || "").trim() || null;
  const image_url = ((formData.get("image_url") as string) || "").trim() || null;

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

  if (id) {
    await supabase
      .from("products")
      .update({ product_type_id, name, brand, image_url, attributes, updated_at: new Date().toISOString() })
      .eq("id", id);
  } else {
    // Slug único: se colidir, sufixa com um trecho aleatório.
    let canonical_slug = slugify(`${brand ?? ""} ${name}`);
    const { data: existing } = await supabase
      .from("products")
      .select("id")
      .eq("canonical_slug", canonical_slug)
      .maybeSingle();
    if (existing) canonical_slug = `${canonical_slug}-${Math.random().toString(36).slice(2, 6)}`;

    await supabase
      .from("products")
      .insert({ product_type_id, name, brand, image_url, attributes, canonical_slug });
  }

  revalidateAllLocales("/admin/produtos");
  revalidateAllLocales("/");
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

// Usado pelo form pra listar os tipos disponíveis.
export async function getProductTypes(): Promise<ProductType[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("product_types").select("*").order("name");
  return (data ?? []) as ProductType[];
}
