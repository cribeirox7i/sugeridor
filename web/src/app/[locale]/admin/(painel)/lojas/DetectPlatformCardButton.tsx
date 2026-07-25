"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { updateStorePlatform } from "./actions";

// Versão compacta do "Detectar" pra rodar direto no card da grid/lista, sem
// abrir o modal de edição — aplica o resultado na hora.
export default function DetectPlatformCardButton({
  storeId,
  siteUrl,
}: {
  storeId: string;
  siteUrl: string | null;
}) {
  const t = useTranslations("admin.stores");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function detect() {
    if (!siteUrl) return;
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/detect-platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: siteUrl }),
      });
      const data = await res.json();
      if (data.platform) {
        await updateStorePlatform(storeId, data.platform, data.config ?? {});
        setMsg(t("detectFound", { platform: data.platform }));
        router.refresh();
      } else {
        setMsg(data.note ?? t("detectNotFound"));
      }
    } catch {
      setMsg(t("detectError"));
    } finally {
      setLoading(false);
    }
  }

  if (!siteUrl) return null;

  return (
    <div className="inline-block">
      <button
        type="button"
        onClick={detect}
        disabled={loading}
        className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
      >
        {loading ? t("detecting") : t("detectButton")}
      </button>
      {msg && <p className="mt-1 max-w-[180px] text-xs text-amber-600 dark:text-amber-400">{msg}</p>}
    </div>
  );
}
