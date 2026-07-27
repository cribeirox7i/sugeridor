// Escrita em lote de patches PARCIAIS em `products`, usada pelas ações de
// manutenção do admin (normalizar nomes, reclassificar, regravar marca,
// aplicar de/para).
//
// O gotcha que justifica este arquivo existir: no PostgREST o `upsert` é um
// `INSERT ... ON CONFLICT DO UPDATE`, então a linha enviada precisa ser
// COMPLETA. Mandar `{ id, name }` viola os NOT NULL de `products`
// (product_type_id, canonical_slug) e o banco devolve 400 — e, pior, as ações
// que não checavam o erro exibiam banner verde de sucesso enquanto nada tinha
// sido gravado (aconteceu de verdade: 739 nomes "normalizados" continuaram em
// CAIXA ALTA). O mesmo erro já tinha sido corrigido no scraper, em
// scraper/db.py::update_by_id_many.
//
// A saída aqui é diferente da do scraper: em vez de um PATCH por linha (que a
// 739 produtos seria lento demais pra uma Server Action), busca as linhas
// completas e faz merge do patch em cima, mantendo a escrita em lote.
import type { SupabaseClient } from "@supabase/supabase-js";

// Ids por consulta de leitura: UUID é longo e uma cláusula `in(...)` gigante
// gera URL que estoura limite de header (mesma cautela de queries.ts).
const READ_BATCH = 100;
const WRITE_BATCH = 200;

export type ProductPatch = { id: string } & Record<string, unknown>;

export async function patchProducts(
  supabase: SupabaseClient,
  patches: ProductPatch[],
): Promise<{ error: string | null; updated: number }> {
  if (patches.length === 0) return { error: null, updated: 0 };

  const patchById = new Map(patches.map((p) => [p.id, p]));
  const ids = [...patchById.keys()];
  const rows: Record<string, unknown>[] = [];

  // 1. Linhas completas (o upsert precisa delas).
  for (let i = 0; i < ids.length; i += READ_BATCH) {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .in("id", ids.slice(i, i + READ_BATCH));
    if (error) return { error: error.message, updated: 0 };
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const patch = patchById.get(row.id as string);
      if (patch) rows.push({ ...row, ...patch, updated_at: new Date().toISOString() });
    }
  }

  // 2. Escrita em lote, checando o erro de cada lote — silenciar aqui é o que
  // fazia a UI mentir.
  for (let i = 0; i < rows.length; i += WRITE_BATCH) {
    const { error } = await supabase
      .from("products")
      .upsert(rows.slice(i, i + WRITE_BATCH), { onConflict: "id" });
    if (error) return { error: error.message, updated: 0 };
  }

  return { error: null, updated: rows.length };
}
