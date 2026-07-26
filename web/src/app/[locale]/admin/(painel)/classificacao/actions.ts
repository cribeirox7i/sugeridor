"use server";

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
