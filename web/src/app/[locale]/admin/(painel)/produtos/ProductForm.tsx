"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Product, ProductType } from "@/lib/types";
import ClearableInput from "@/components/admin/ClearableInput";
import { saveProduct } from "./actions";

export default function ProductForm({
  productTypes,
  editing,
}: {
  productTypes: ProductType[];
  editing?: Product;
}) {
  const t = useTranslations("admin.products");
  const tAttr = useTranslations("attributes");
  const tCommon = useTranslations("admin.common");
  const [typeId, setTypeId] = useState(
    editing?.product_type_id ?? productTypes[0]?.id ?? "",
  );
  const selected = productTypes.find((pt) => pt.id === typeId);
  const fields = selected?.attribute_schema?.fields ?? [];

  const inputCls =
    "w-full rounded border border-neutral-300 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";
  const labelCls = "text-sm text-neutral-500 dark:text-neutral-400";

  return (
    <form action={saveProduct} className="space-y-4">
      <h2 className="font-medium">{editing ? t("editTitle") : t("newTitle")}</h2>
      {editing && <input type="hidden" name="id" value={editing.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className={labelCls}>{t("type")}</span>
          <select
            name="product_type_id"
            value={typeId}
            onChange={(e) => setTypeId(e.target.value)}
            className={inputCls}
          >
            {productTypes.map((pt) => (
              <option key={pt.id} value={pt.id}>
                {pt.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className={labelCls}>{t("name")}</span>
          <ClearableInput
            name="name"
            required
            defaultValue={editing?.name ?? ""}
            className={inputCls}
            clearLabel={tCommon("clear")}
          />
        </label>

        <label className="space-y-1">
          <span className={labelCls}>{t("brand")}</span>
          <ClearableInput
            name="brand"
            defaultValue={editing?.brand ?? ""}
            className={inputCls}
            clearLabel={tCommon("clear")}
          />
        </label>

        <label className="space-y-1">
          <span className={labelCls}>{t("image")}</span>
          <ClearableInput
            name="image_url"
            type="url"
            placeholder="https://..."
            defaultValue={editing?.image_url ?? ""}
            className={inputCls}
            clearLabel={tCommon("clear")}
          />
        </label>

        <label className="space-y-1">
          <span className={labelCls}>{t("category")}</span>
          <select name="category" defaultValue={editing?.category ?? "cervejas"} className={inputCls}>
            <option value="cervejas">{t("categoryCervejas")}</option>
            <option value="kit">{t("categoryKit")}</option>
            <option value="copo">{t("categoryCopo")}</option>
            <option value="souvenirs">{t("categorySouvenirs")}</option>
            <option value="eventos">{t("categoryEventos")}</option>
          </select>
        </label>
      </div>

      {fields.length > 0 && (
        <div className="space-y-3 rounded border border-neutral-200 p-4 dark:border-neutral-800">
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            {t("attributesOf", { type: selected?.name ?? "" })}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((f) => {
              const current = editing?.attributes?.[f.key];
              return (
                <label key={f.key} className="space-y-1">
                  <span className={labelCls}>{tAttr.has(f.key) ? tAttr(f.key) : f.label}</span>
                  {f.type === "select" ? (
                    <select name={`attr_${f.key}`} defaultValue={current != null ? String(current) : ""} className={inputCls}>
                      <option value="">—</option>
                      {(f.options ?? []).map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <ClearableInput
                      name={`attr_${f.key}`}
                      type={f.type === "number" ? "number" : "text"}
                      defaultValue={current != null ? String(current) : ""}
                      className={inputCls}
                      clearLabel={tCommon("clear")}
                    />
                  )}
                </label>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 dark:text-neutral-950"
        >
          {editing ? t("save") : t("add")}
        </button>
        <Link
          href="/admin/produtos"
          className="rounded border border-neutral-300 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          {t("cancel")}
        </Link>
      </div>
    </form>
  );
}
