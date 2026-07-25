"use server";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { revalidateAllLocales } from "@/lib/revalidate";

export async function saveAlert(formData: FormData) {
  const id = (formData.get("id") as string) || null;
  const scope = (formData.get("scope") as string) || "";
  const scope_id = scope === "global" ? null : (formData.get("scope_id") as string) || null;
  const thresholdRaw = (formData.get("threshold_percent") as string)?.replace(",", ".");
  const threshold_percent = Number(thresholdRaw);
  const active = formData.get("active") === "on";

  if (!scope || !Number.isFinite(threshold_percent)) return;
  if (scope !== "global" && !scope_id) return;

  const supabase = await createClient();
  if (id) {
    await supabase
      .from("price_alerts")
      .update({ scope, scope_id, threshold_percent, active })
      .eq("id", id);
  } else {
    await supabase
      .from("price_alerts")
      .insert({ scope, scope_id, threshold_percent, notify_channel: "email", active });
  }

  revalidateAllLocales("/admin/alertas");
}

export async function toggleAlertActive(formData: FormData) {
  const id = formData.get("id") as string;
  const active = formData.get("active") === "true";
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("price_alerts").update({ active: !active }).eq("id", id);
  revalidateAllLocales("/admin/alertas");
}

export async function deleteAlert(formData: FormData) {
  const id = formData.get("id") as string;
  if (!id) return;
  const supabase = await createClient();
  // alert_triggers referencia price_alerts sem cascade — se já disparou
  // alguma vez, apagar a regra bloqueia por FK (mesmo padrão de
  // deleteStore/deleteOffer: checar o erro em vez de falhar em silêncio).
  const { error } = await supabase.from("price_alerts").delete().eq("id", id);

  if (error) {
    const locale = await getLocale();
    redirect(`/${locale}/admin/alertas?error=delete-blocked`);
  }

  revalidateAllLocales("/admin/alertas");
}
