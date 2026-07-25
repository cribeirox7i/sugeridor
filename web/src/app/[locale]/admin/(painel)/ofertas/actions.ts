"use server";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
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

  const locale = await getLocale();

  if (error || !offer) {
    // Mesmo motivo do fix em lojas/produtos: sem checar isso, o modal
    // reabria vazio parecendo "não fez nada" e o usuário clicava de novo.
    redirect(`/${locale}/admin/ofertas?new=1&error=save-failed`);
  }

  // Cada preço registrado vira um ponto no histórico.
  await supabase.from("price_history").insert({ offer_id: offer.id, price, captured_at: now });

  revalidateAllLocales("/admin/ofertas");
  revalidateAllLocales("/");
  redirect(`/${locale}/admin/ofertas`);
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
  const { error } = await supabase.from("offers").delete().eq("id", id);

  if (error) {
    const locale = await getLocale();
    redirect(`/${locale}/admin/ofertas?error=delete-blocked`);
  }

  revalidateAllLocales("/admin/ofertas");
  revalidateAllLocales("/");
}

// Exclusão em lote (checkboxes da grid) — chamada direto pelo client
// (OffersTable), não por <form action>, porque precisa devolver
// sucesso/erro pro componente sem navegar. Um único DELETE ... WHERE id IN
// (...) é uma transação só: se alguma oferta selecionada tiver
// alert_triggers vinculado (sem cascade, ver migration 0001), a exclusão
// inteira falha — o client mostra o erro e nada é apagado, em vez de
// apagar parte da seleção sem avisar.
export async function deleteOffers(ids: string[]): Promise<{ error: string | null }> {
  if (ids.length === 0) return { error: null };
  const supabase = await createClient();
  const { error } = await supabase.from("offers").delete().in("id", ids);

  if (error) return { error: error.message };

  revalidateAllLocales("/admin/ofertas");
  revalidateAllLocales("/");
  return { error: null };
}
