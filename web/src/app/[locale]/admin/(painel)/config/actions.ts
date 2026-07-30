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

  revalidateAllLocales("/admin/config");
}

export async function saveOfferExpirationDays(formData: FormData) {
  const days = Number((formData.get("offer_expiration_days") as string)?.replace(",", "."));
  if (!Number.isFinite(days) || days <= 0) return;

  const supabase = await createClient();
  // site_settings é singleton (id=1, ver migration 0004/0008) — sempre existe.
  await supabase
    .from("site_settings")
    .update({ offer_expiration_days: Math.round(days) })
    .eq("id", 1);

  revalidateAllLocales("/admin/config");
}

// Os dois toggles de automação pós-coleta (migration 0018) — ver
// web/src/lib/postCollect.ts. Checkbox desmarcado não manda o campo no
// FormData, então ausência = false (não "não mudou").
export async function saveAutomationSettings(formData: FormData) {
  const auto_apply_replacements = formData.get("auto_apply_replacements") === "on";
  const auto_merge_duplicates = formData.get("auto_merge_duplicates") === "on";

  const supabase = await createClient();
  await supabase
    .from("site_settings")
    .update({ auto_apply_replacements, auto_merge_duplicates })
    .eq("id", 1);

  revalidateAllLocales("/admin/config");
}

export async function toggleAlertActive(formData: FormData) {
  const id = formData.get("id") as string;
  const active = formData.get("active") === "true";
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("price_alerts").update({ active: !active }).eq("id", id);
  revalidateAllLocales("/admin/config");
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
    redirect(`/${locale}/admin/config?error=delete-blocked`);
  }

  revalidateAllLocales("/admin/config");
}
