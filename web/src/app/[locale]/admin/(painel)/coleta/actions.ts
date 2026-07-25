"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidateAllLocales } from "@/lib/revalidate";

export async function toggleStoreCollection(id: string, included: boolean) {
  const supabase = await createClient();
  await supabase.from("stores").update({ include_in_collection: included }).eq("id", id);
  revalidateAllLocales("/admin/coleta");
}

export async function setStoresCollection(ids: string[], included: boolean) {
  if (ids.length === 0) return;
  const supabase = await createClient();
  await supabase.from("stores").update({ include_in_collection: included }).in("id", ids);
  revalidateAllLocales("/admin/coleta");
}
