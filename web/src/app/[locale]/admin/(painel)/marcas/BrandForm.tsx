"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter, Link } from "@/i18n/navigation";
import { STORE_COUNTRIES } from "@/lib/countries";
import { addBrand, addBrandAlias, deleteBrandAlias, updateBrand, mergeBrandAction } from "./actions";

type AliasRow = { id: string; alias: string };
type EditingBrand = { id: string; name: string; country: string | null };

const inputCls =
  "w-full rounded border border-neutral-300 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
const labelCls = "text-sm text-neutral-500 dark:text-neutral-400";
const primaryBtnCls =
  "rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-60 dark:text-neutral-950";
const secondaryBtnCls =
  "rounded border border-neutral-300 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800";

// Modal de "+ Incluir" (form action nativo, redireciona) e de "Editar"
// (submit interceptado — item 8 precisa do retorno de updateBrand pra saber
// se pergunta sobre mesclar, e um <form action> normal não devolve nada pro
// cliente). Mesma dualidade de ConflictList.tsx em /admin/ferramentas.
export default function BrandForm({
  editing,
  aliases,
  cancelHref,
  erro,
}: {
  editing?: EditingBrand;
  aliases?: AliasRow[];
  cancelHref: string;
  erro?: string;
}) {
  const t = useTranslations("admin.brands");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [clientError, setClientError] = useState<string | null>(null);

  function handleEditSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    const fd = new FormData(e.currentTarget);
    const name = (fd.get("name") as string) || "";
    const country = (fd.get("country") as string) || "";
    setClientError(null);
    startTransition(async () => {
      const result = await updateBrand(editing.id, name, country);
      if (result.status === "conflict") {
        const confirmed = window.confirm(t("confirmMerge", { name: result.existingName }));
        if (!confirmed) return;
        const merged = await mergeBrandAction(editing.id, result.existingId);
        if (merged.error) {
          setClientError(t("mergeFailed"));
          return;
        }
        router.push(cancelHref);
        router.refresh();
        return;
      }
      if (result.status === "error") {
        setClientError(t("actionFailed"));
        return;
      }
      router.push(cancelHref);
      router.refresh();
    });
  }

  const errorMessage =
    clientError ??
    (erro === "duplicada" ? t("duplicateName") : erro === "salvar" ? t("actionFailed") : null);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-medium">{editing ? t("editTitle") : t("newBrandTitle")}</h2>
        {errorMessage && (
          <p className="mt-2 rounded bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {errorMessage}
          </p>
        )}
      </div>

      {editing ? (
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1">
              <span className={labelCls}>{t("fieldName")}</span>
              <input name="name" required defaultValue={editing.name} className={inputCls} />
            </label>
            <label className="space-y-1">
              <span className={labelCls}>{t("fieldCountry")}</span>
              <select name="country" defaultValue={editing.country ?? "Brasil"} className={inputCls}>
                {STORE_COUNTRIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={isPending} className={primaryBtnCls}>
              {t("save")}
            </button>
            <Link href={cancelHref} className={secondaryBtnCls}>
              {t("cancel")}
            </Link>
          </div>
        </form>
      ) : (
        <form action={addBrand} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1">
              <span className={labelCls}>{t("fieldName")}</span>
              <input name="name" required placeholder={t("namePlaceholder")} className={inputCls} />
            </label>
            <label className="space-y-1">
              <span className={labelCls}>{t("fieldCountry")}</span>
              <select name="country" defaultValue="Brasil" className={inputCls}>
                {STORE_COUNTRIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" className={primaryBtnCls}>
              {t("addBrand")}
            </button>
            <Link href={cancelHref} className={secondaryBtnCls}>
              {t("cancel")}
            </Link>
          </div>
        </form>
      )}

      {editing && (
        <div className="space-y-2 border-t border-neutral-200 pt-4 dark:border-neutral-800">
          <p className="text-sm font-medium">{t("aliasesTitle", { count: aliases?.length ?? 0 })}</p>
          {!aliases || aliases.length === 0 ? (
            <p className="text-xs text-neutral-500">{t("noAliases")}</p>
          ) : (
            <ul className="space-y-1">
              {aliases.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate font-mono text-xs">{a.alias}</span>
                  <form action={deleteBrandAlias}>
                    <input type="hidden" name="id" value={a.id} />
                    <button
                      type="submit"
                      className="shrink-0 rounded px-1 text-neutral-400 hover:bg-neutral-100 hover:text-red-600 dark:hover:bg-neutral-800 dark:hover:text-red-400"
                    >
                      ✕
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <form action={addBrandAlias} className="flex gap-2">
            <input type="hidden" name="brand_id" value={editing.id} />
            <input name="alias" placeholder={t("aliasPlaceholder")} className={`${inputCls} flex-1`} />
            <button type="submit" className={secondaryBtnCls}>
              {t("addAlias")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
