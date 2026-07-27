// Decisão de como mesclar dois produtos duplicados. Lógica pura, separada da
// Server Action (ferramentas/actions.ts) pra dar pra testar os casos difíceis
// sem banco — mesmo padrão de `computeFeaturedDeals` e `planReplacements`.

export type MergeOffer = {
  id: string;
  store_id: string;
  last_seen_at: string;
};

export type MergePlan = {
  // Ofertas do produto descartado que passam a apontar pro produto mantido.
  toMove: string[];
  // Ofertas apagadas por serem da MESMA loja que outra já existente —
  // `offers` tem unique (product_id, store_id), então não podem coexistir.
  toDelete: string[];
};

// Ofertas de lojas diferentes convivem: é justamente o objetivo de mesclar,
// ter várias lojas no mesmo produto. O conflito só existe quando as duas
// pontas têm oferta da MESMA loja — aí vence a de `last_seen_at` mais recente,
// porque é a que reflete o preço que a loja mostra hoje.
export function planMerge(keepOffers: MergeOffer[], dropOffers: MergeOffer[]): MergePlan {
  const keepByStore = new Map<string, MergeOffer>();
  for (const o of keepOffers) keepByStore.set(o.store_id, o);

  const toMove: string[] = [];
  const toDelete: string[] = [];

  for (const o of dropOffers) {
    const rival = keepByStore.get(o.store_id);
    if (!rival) {
      toMove.push(o.id);
      continue;
    }
    if (new Date(o.last_seen_at) > new Date(rival.last_seen_at)) {
      // A do produto descartado é mais recente: ela fica (movida) e a antiga sai.
      toDelete.push(rival.id);
      toMove.push(o.id);
    } else {
      toDelete.push(o.id);
    }
  }

  return { toMove, toDelete };
}
