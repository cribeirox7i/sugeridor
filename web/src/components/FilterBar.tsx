import Link from "next/link";

type Props = {
  estilos: string[];
  paises: string[];
  stores: { id: string; name: string }[];
  current: {
    estilo?: string;
    pais?: string;
    storeId?: string;
    precoMin?: string;
    precoMax?: string;
  };
};

// Formulário GET puro: submeter recarrega a página com os filtros na query string.
// Sem JS no cliente — funciona com cache/SSR e é simples de linkar/compartilhar.
export default function FilterBar({ estilos, paises, stores, current }: Props) {
  const inputCls = "rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm";
  const hasFilters =
    current.estilo || current.pais || current.storeId || current.precoMin || current.precoMax;

  return (
    <form method="get" className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-500">Estilo</span>
        <select name="estilo" defaultValue={current.estilo ?? ""} className={inputCls}>
          <option value="">Todos</option>
          {estilos.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-500">País</span>
        <select name="pais" defaultValue={current.pais ?? ""} className={inputCls}>
          <option value="">Todos</option>
          {paises.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-500">Loja</span>
        <select name="loja" defaultValue={current.storeId ?? ""} className={inputCls}>
          <option value="">Todas</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-500">Preço mín.</span>
        <input
          name="min"
          inputMode="decimal"
          defaultValue={current.precoMin ?? ""}
          placeholder="0"
          className={`${inputCls} w-24`}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-500">Preço máx.</span>
        <input
          name="max"
          inputMode="decimal"
          defaultValue={current.precoMax ?? ""}
          placeholder="∞"
          className={`${inputCls} w-24`}
        />
      </label>

      <button
        type="submit"
        className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-amber-500"
      >
        Filtrar
      </button>

      {hasFilters && (
        <Link
          href="/"
          className="rounded border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-900"
        >
          Limpar
        </Link>
      )}
    </form>
  );
}
