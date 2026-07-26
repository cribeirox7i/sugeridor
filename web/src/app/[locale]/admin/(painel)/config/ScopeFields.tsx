"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

// Escopo da regra decide se aparece (e o que popula) o campo scope_id — mesmo
// padrão condicional de StoreForm.tsx (lojas). Trocar de escopo reseta o
// select de scope_id (key={scope}) porque as opções mudam de lista.
export default function ScopeFields({
  defaultScope,
  defaultScopeId,
  products,
  productTypes,
}: {
  defaultScope: string;
  defaultScopeId: string;
  products: { id: string; name: string; brand: string | null }[];
  productTypes: { id: string; name: string }[];
}) {
  const t = useTranslations("admin.config");
  const [scope, setScope] = useState(defaultScope || "global");
  const inputCls =
    "w-full rounded border border-neutral-300 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
  const labelCls = "text-sm text-neutral-500 dark:text-neutral-400";

  return (
    <>
      <label className="space-y-1">
        <span className={labelCls}>{t("scope")}</span>
        <select
          name="scope"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className={inputCls}
        >
          <option value="global">{t("scopeGlobal")}</option>
          <option value="product">{t("scopeProduct")}</option>
          <option value="product_type">{t("scopeProductType")}</option>
        </select>
      </label>

      {scope !== "global" && (
        <label className="space-y-1" key={scope}>
          <span className={labelCls}>{t("scopeId")}</span>
          <select
            name="scope_id"
            required
            defaultValue={scope === defaultScope ? defaultScopeId : ""}
            className={inputCls}
          >
            <option value="" disabled>
              {t("scopeIdPlaceholder")}
            </option>
            {scope === "product"
              ? products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.brand ? `${p.brand} — ${p.name}` : p.name}
                  </option>
                ))
              : productTypes.map((pt) => (
                  <option key={pt.id} value={pt.id}>
                    {pt.name}
                  </option>
                ))}
          </select>
        </label>
      )}
    </>
  );
}
