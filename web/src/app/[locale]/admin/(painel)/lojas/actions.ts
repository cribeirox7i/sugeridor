"use server";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { revalidateAllLocales } from "@/lib/revalidate";

export async function saveStore(formData: FormData) {
  const id = (formData.get("id") as string) || null;
  const name = (formData.get("name") as string)?.trim();
  const site_url = ((formData.get("site_url") as string) || "").trim() || null;
  const logo_url = ((formData.get("logo_url") as string) || "").trim() || null;
  const description = ((formData.get("description") as string) || "").trim() || null;
  const platform = ((formData.get("platform") as string) || "").trim() || null;
  const configRaw = ((formData.get("config") as string) || "").trim();

  if (!name) return;

  let config: Record<string, unknown> = {};
  if (configRaw) {
    try {
      config = JSON.parse(configRaw);
    } catch {
      // JSON inválido: volta pro form com o erro em vez de salvar algo quebrado
      // silenciosamente (foi exatamente esse tipo de erro silencioso que
      // atrapalhou o primeiro teste de coleta).
      const locale = await getLocale();
      const qs = id ? `?edit=${id}&error=config-invalido` : `?error=config-invalido`;
      redirect(`/${locale}/admin/lojas${qs}`);
    }
  }

  const supabase = await createClient();
  const { error } = id
    ? await supabase
        .from("stores")
        .update({ name, site_url, logo_url, description, platform, config })
        .eq("id", id)
    : await supabase.from("stores").insert({ name, site_url, logo_url, description, platform, config });

  const locale = await getLocale();

  if (error) {
    // Erro de verdade no banco (ex: RLS, constraint) — antes disso era
    // ignorado em silêncio e o modal só reabria vazio, parecendo "não fez
    // nada" (foi exatamente isso que gerou lojas duplicadas: o usuário
    // clicava de novo achando que não tinha salvo).
    const qs = id ? `?edit=${id}&error=save-failed` : `?new=1&error=save-failed`;
    redirect(`/${locale}/admin/lojas${qs}`);
  }

  revalidateAllLocales("/admin/lojas");
  // Sucesso: fecha o modal (volta pra lista limpa) em vez de deixar o form
  // reaberto vazio — é esse retorno visual que faltava.
  redirect(`/${locale}/admin/lojas`);
}

// Usado pelo botão "Detectar" direto na grid (sem abrir o modal de edição) —
// aplica o resultado da detecção imediatamente.
export async function updateStorePlatform(
  id: string,
  platform: string | null,
  config: Record<string, unknown>,
) {
  const supabase = await createClient();
  await supabase.from("stores").update({ platform, config }).eq("id", id);
  revalidateAllLocales("/admin/lojas");
}

// Usado pelo botão "Detectar" direto na grid: preenche logo/descrição só se
// a loja ainda não tiver (nunca sobrescreve o que o admin já cadastrou à
// mão) — mesmo princípio de backfill do pipeline.py do scraper.
export async function backfillStoreBranding(
  id: string,
  logoUrl: string | null,
  description: string | null,
) {
  if (!logoUrl && !description) return;
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("stores")
    .select("logo_url, description")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return;

  const patch: Record<string, string> = {};
  if (!existing.logo_url && logoUrl) patch.logo_url = logoUrl;
  if (!existing.description && description) patch.description = description;
  if (Object.keys(patch).length === 0) return;

  await supabase.from("stores").update(patch).eq("id", id);
  revalidateAllLocales("/admin/lojas");
}

export async function deleteStore(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) return;
  const supabase = await createClient();
  const { error } = await supabase.from("stores").delete().eq("id", id);

  if (error) {
    // Sem ON DELETE CASCADE de propósito: apagar a loja não deve apagar o
    // histórico das ofertas dela sem avisar. Se bloquear por FK, mostra o
    // motivo em vez de falhar silenciosamente (era exatamente esse o bug
    // relatado: "clico em excluir e não acontece nada").
    const locale = await getLocale();
    redirect(`/${locale}/admin/lojas?error=delete-blocked`);
  }

  revalidateAllLocales("/admin/lojas");
}
