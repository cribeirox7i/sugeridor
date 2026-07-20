"use client";

import { useState } from "react";
import Link from "next/link";
import type { Product, ProductType } from "@/lib/types";
import { saveProduct } from "./actions";

export default function ProductForm({
  productTypes,
  editing,
}: {
  productTypes: ProductType[];
  editing?: Product;
}) {
  const [typeId, setTypeId] = useState(
    editing?.product_type_id ?? productTypes[0]?.id ?? "",
  );
  const selected = productTypes.find((t) => t.id === typeId);
  const fields = selected?.attribute_schema?.fields ?? [];

  const inputCls =
    "w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2";

  return (
    <form
      action={saveProduct}
      className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-900 p-5"
    >
      <h2 className="font-medium">{editing ? "Editar produto" : "Novo produto"}</h2>
      {editing && <input type="hidden" name="id" value={editing.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-sm text-neutral-400">Tipo *</span>
          <select
            name="product_type_id"
            value={typeId}
            onChange={(e) => setTypeId(e.target.value)}
            className={inputCls}
          >
            {productTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-sm text-neutral-400">Nome *</span>
          <input name="name" required defaultValue={editing?.name ?? ""} className={inputCls} />
        </label>

        <label className="space-y-1">
          <span className="text-sm text-neutral-400">Marca</span>
          <input name="brand" defaultValue={editing?.brand ?? ""} className={inputCls} />
        </label>

        <label className="space-y-1">
          <span className="text-sm text-neutral-400">Imagem (URL)</span>
          <input
            name="image_url"
            type="url"
            placeholder="https://..."
            defaultValue={editing?.image_url ?? ""}
            className={inputCls}
          />
        </label>
      </div>

      {fields.length > 0 && (
        <div className="space-y-3 rounded border border-neutral-800 p-4">
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            Atributos de {selected?.name}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((f) => {
              const current = editing?.attributes?.[f.key];
              return (
                <label key={f.key} className="space-y-1">
                  <span className="text-sm text-neutral-400">{f.label}</span>
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
                    <input
                      name={`attr_${f.key}`}
                      type={f.type === "number" ? "number" : "text"}
                      step={f.type === "number" ? "any" : undefined}
                      defaultValue={current != null ? String(current) : ""}
                      className={inputCls}
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
          className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-amber-500"
        >
          {editing ? "Salvar" : "Adicionar"}
        </button>
        {editing && (
          <Link
            href="/admin/produtos"
            className="rounded border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
          >
            Cancelar
          </Link>
        )}
      </div>
    </form>
  );
}
