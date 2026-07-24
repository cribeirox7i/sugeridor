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
  if (id) {
    await supabase
      .from("stores")
      .update({ name, site_url, logo_url, description, platform, config })
      .eq("id", id);
  } else {
    await supabase.from("stores").insert({ name, site_url, logo_url, description, platform, config });
  }

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
