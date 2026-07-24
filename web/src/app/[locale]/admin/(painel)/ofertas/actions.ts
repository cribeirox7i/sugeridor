"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidateAllLocales } from "@/lib/revalidate";

export async function saveOffer(formData: FormData) {
  const product_id = formData.get("product_id") as string;
  const store_id = formData.get("store_id") as string;
  const priceRaw = (formData.get("price") as string)?.replace(",", ".");
  const price = Number(priceRaw);
  const url = (formData.get("url") as string)?.trim();
  const currency = ((formData.get("currency") as string) || "BRL").trim();

  if (!product_id || !store_id || !url || !Number.isFinite(price)) return;

  const supabase = await createClient();
  const now = new Date().toISOString();

  // Uma oferta por (produto, loja): upsert. Cadastro manual sempre grava como
  // ativo e com source_type 'manual'.
  const { data: offer, error } = await supabase
    .from("offers")
    .upsert(
      {
        product_id,
        store_id,
        price,
        currency,
        url,
        source_type: "manual",
        active: true,
        last_seen_at: now,
        updated_at: now,
      },
      { onConflict: "product_id,store_id" },
    )
    .select("id")
    .single();

  if (error || !offer) return;

  // Cada preço registrado vira um ponto no histórico.
  await supabase.from("price_history").insert({ offer_id: offer.id, price, captured_at: now });

  revalidateAllLocales("/admin/ofertas");
  revalidateAllLocales("/");
}

export async function toggleOfferActive(formData: FormData) {
  const id = formData.get("id") as string;
  const active = formData.get("active") === "true";
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("offers").update({ active: !active, updated_at: new Date().toISOString() }).eq("id", id);
  revalidateAllLocales("/admin/ofertas");
  revalidateAllLocales("/");
}

export async function deleteOffer(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) return;
  const supabase = await createClient();
  // price_history tem ON DELETE CASCADE, então some junto.
  await supabase.from("offers").delete().eq("id", id);
  revalidateAllLocales("/admin/ofertas");
  revalidateAllLocales("/");
}
