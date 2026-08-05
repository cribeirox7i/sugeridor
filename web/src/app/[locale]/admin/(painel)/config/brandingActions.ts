"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { revalidateAllLocales } from "@/lib/revalidate";

const BUCKET = "branding";

// Um arquivo fixo por slot (sem extensão no nome — o content-type vem do
// upload, não do nome) com `upsert: true`: reenviar substitui o mesmo
// objeto no Storage em vez de acumular arquivo órfão a cada troca de logo.
// O `?v=` na URL salva é o que evita servir a imagem antiga cacheada pelo
// navegador/CDN depois de uma substituição (mesmo caminho, URL "nova").
async function uploadLogo(
  supabase: SupabaseClient,
  slot: "logo-black" | "logo-white",
  file: File,
): Promise<string> {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(slot, file, { upsert: true, contentType: file.type || "image/png" });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(slot);
  return `${data.publicUrl}?v=${Date.now()}`;
}

export async function saveSiteSettings(formData: FormData) {
  const supabase = await createClient();

  const blackFile = formData.get("logo_black_file") as File | null;
  const whiteFile = formData.get("logo_white_file") as File | null;
  const removeBlack = formData.get("remove_logo_black") === "on";
  const removeWhite = formData.get("remove_logo_white") === "on";

  // Só troca o que o admin de fato mandou — sem isto, salvar o formulário
  // sem escolher arquivo novo apagaria a logo já cadastrada.
  const { data: current } = await supabase
    .from("site_settings")
    .select("logo_black_url, logo_white_url")
    .eq("id", 1)
    .maybeSingle();

  let logo_black_url = current?.logo_black_url ?? null;
  let logo_white_url = current?.logo_white_url ?? null;

  if (removeBlack) logo_black_url = null;
  if (removeWhite) logo_white_url = null;

  if (blackFile && blackFile.size > 0) {
    logo_black_url = await uploadLogo(supabase, "logo-black", blackFile);
  }
  if (whiteFile && whiteFile.size > 0) {
    logo_white_url = await uploadLogo(supabase, "logo-white", whiteFile);
  }

  await supabase
    .from("site_settings")
    .update({ logo_black_url, logo_white_url, updated_at: new Date().toISOString() })
    .eq("id", 1);

  // A tela /admin/logomarca foi absorvida por Config — era só este formulário,
  // e logomarca é configuração do site como as outras que já viviam lá.
  revalidateAllLocales("/admin/config");
  revalidateAllLocales("/");
}
