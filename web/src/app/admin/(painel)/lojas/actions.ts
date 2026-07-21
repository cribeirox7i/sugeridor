"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function saveStore(formData: FormData) {
  const id = (formData.get("id") as string) || null;
  const name = (formData.get("name") as string)?.trim();
  const site_url = ((formData.get("site_url") as string) || "").trim() || null;
  const scraper_key = ((formData.get("scraper_key") as string) || "").trim() || null;

  if (!name) return;

  const supabase = await createClient();
  if (id) {
    await supabase.from("stores").update({ name, site_url, scraper_key }).eq("id", id);
  } else {
    await supabase.from("stores").insert({ name, site_url, scraper_key });
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
