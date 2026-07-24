"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function saveStore(formData: FormData) {
  const id = (formData.get("id") as string) || null;
  const name = (formData.get("name") as string)?.trim();
  const site_url = ((formData.get("site_url") as string) || "").trim() || null;
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
      const qs = id ? `?edit=${id}&error=config-invalido` : `?error=config-invalido`;
      redirect(`/admin/lojas${qs}`);
    }
  }

  const supabase = await createClient();
  if (id) {
    await supabase.from("stores").update({ name, site_url, platform, config }).eq("id", id);
  } else {
    await supabase.from("stores").insert({ name, site_url, platform, config });
  }

  revalidatePath("/admin/lojas");
}

export async function deleteStore(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("stores").delete().eq("id", id);
  revalidatePath("/admin/lojas");
}
