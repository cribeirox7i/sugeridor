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

// Qual dos duplicados fica. A ordem dos critérios importa:
//
//  1. mais antigo — o produto que JÁ EXISTIA sempre vence o que acabou de ser
//     criado por uma coleta/substituição nova. É o critério decisivo, não um
//     desempate: o ID/slug de um produto é a URL que foi compartilhada,
//     salva em alerta ou linkada de fora, e trocar qual lado sobrevive a cada
//     coleta (como o critério antigo fazia, priorizando "oferta vista mais
//     recentemente") quebrava esses links a cada mesclagem — o mesmo par
//     Nono Bier que motivou o critério de recência abaixo podia trocar de
//     lado de novo na coleta seguinte, sem necessidade nenhuma;
//  2. mais ofertas — desempate quando os dois são da MESMA coleta original
//     (created_at próximo o bastante pra não decidir sozinho): perder menos
//     ofertas é melhor;
//  3. oferta vista mais recentemente — o registro que o coletor está mantendo
//     hoje é o bom quando o resto empata (aconteceu com 14 produtos da Nono
//     Bier, um deles anunciando R$ 29,95 quando a loja já cobrava R$ 25);
//  4. tem imagem, 5. tem marca — o lado mais completo, se ainda empatar.
//
// Imagem e marca do lado descartado não se perdem mesmo quando ele não vence:
// ver o preenchimento em lib/curation.ts::mergeProductGroupsWith, que copia
// pro mantido o que estiver faltando nele.
//
// É a MESMA função usada pela tela (pra mostrar qual lado será mantido) e pela
// Server Action (que reconfere com dados frescos): se cada lado decidisse por
// conta, o texto do "confirmar" poderia dizer o contrário do que aconteceria.
export function chooseKeeper<T extends MergeCandidate>(candidates: T[]): T[] {
  const score = (c: MergeCandidate) => [
    -Date.parse(c.created_at),
    c.offers,
    c.lastSeenAt ? Date.parse(c.lastSeenAt) : 0,
    c.image_url ? 1 : 0,
    c.brand?.trim() ? 1 : 0,
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
