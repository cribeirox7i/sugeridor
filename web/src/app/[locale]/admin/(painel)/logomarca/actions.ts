"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidateAllLocales } from "@/lib/revalidate";

export async function saveSiteSettings(formData: FormData) {
  const logo_black_url = ((formData.get("logo_black_url") as string) || "").trim() || null;
  const logo_white_url = ((formData.get("logo_white_url") as string) || "").trim() || null;

  const supabase = await createClient();
  await supabase
    .from("site_settings")
    .update({ logo_black_url, logo_white_url, updated_at: new Date().toISOString() })
    .eq("id", 1);

  revalidateAllLocales("/admin/logomarca");
  revalidateAllLocales("/");
}
