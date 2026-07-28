// Decisão de como mesclar produtos duplicados: quem fica, e o que acontece com
// as ofertas de quem sai. Lógica pura, separada da Server Action
// (ferramentas/actions.ts) pra dar pra testar os casos difíceis sem banco —
// mesmo padrão de `computeFeaturedDeals` e `planReplacements`.

export type MergeOffer = {
  id: string;
  store_id: string;
  last_seen_at: string;
};

// Dados de um lado da duplicata, no mínimo necessário pra decidir quem fica.
export type MergeCandidate = {
  id: string;
  brand: string | null;
  image_url: string | null;
  created_at: string;
  offers: number;
  // last_seen_at mais recente entre as ofertas do produto. null = sem oferta.
  lastSeenAt: string | null;
};

// Qual dos duplicados fica. A ordem dos critérios importa e cada um veio de um
// caso real:
//
//  1. mais ofertas — mesclar é justamente juntar ofertas, então perder menos é
//     melhor (e o lado sem oferta nenhuma, comum nas colisões de de/para, sai);
//  2. oferta vista mais recentemente — é o desempate que decide certo quando a
//     duplicata nasceu de uma mudança de identificador entre duas coletas do
//     mesmo dia: o registro que o coletor está mantendo hoje é o bom, o outro
//     ficou com preço congelado (aconteceu com 14 produtos da Nono Bier, um
//     deles anunciando R$ 29,95 quando a loja já cobrava R$ 25);
//  3. tem imagem, 4. tem marca — o lado mais completo, quando o resto empata;
//  5. mais antigo — só pra a decisão ser determinística (nunca depender da
//     ordem em que o banco devolveu as linhas).
//
// É a MESMA função usada pela tela (pra mostrar qual lado será mantido) e pela
// Server Action (que reconfere com dados frescos): se cada lado decidisse por
// conta, o texto do "confirmar" poderia dizer o contrário do que aconteceria.
export function chooseKeeper<T extends MergeCandidate>(candidates: T[]): T[] {
  const score = (c: MergeCandidate) => [
    c.offers,
    c.lastSeenAt ? Date.parse(c.lastSeenAt) : 0,
    c.image_url ? 1 : 0,
    c.brand?.trim() ? 1 : 0,
    -Date.parse(c.created_at),
  ];
  return [...candidates].sort((a, b) => {
    const sa = score(a);
    const sb = score(b);
    for (let i = 0; i < sa.length; i++) {
      if (sa[i] !== sb[i]) return sb[i] - sa[i];
    }
    return a.id.localeCompare(b.id);
  });
}

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
