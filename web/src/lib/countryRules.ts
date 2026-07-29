// As duas regras de país aplicadas sob demanda pelo botão "Regravar países"
// em /admin/ferramentas. Lógica pura, sem I/O, pra dar pra conferir contra o
// catálogo real antes de gravar qualquer coisa — mesmo padrão de
// `planReplacements`, `planMerge` e `groupByName`.
//
// Até agora essas regras só existiam dentro da coleta (scraper/enrich.py) e
// rodavam uma vez por execução do scraper. O botão é o que permite corrigir o
// catálogo na hora — em especial no caso que motivou o pedido: uma loja
// mudou de 'marketplace' para 'propria' e os produtos dela ficaram com o país
// antigo, errado, até a próxima coleta.
//
// Nenhuma das duas mexe em `canonical_slug`: o país NÃO entra na fórmula do
// slug (ver lib/slug.ts::productSlug), então não há risco de dessincronizar o
// catálogo nem necessidade de ressincronizar depois.

export type ProductForCountry = {
  id: string;
  brand: string | null;
  attributes: Record<string, string | number> | null;
};

export type CountryPatch = {
  id: string;
  attributes: Record<string, string | number>;
  // Qual regra produziu a mudança — a tela reporta os dois números separados.
  rule: "own-store" | "brand";
};

// ── Regra A: a loja própria é AUTORIDADE sobre o país ────────────────
//
// SOBRESCREVE de propósito, ao contrário da versão do scraper
// (enrich.py::apply_own_store_defaults, que só completa o que falta): quando
// uma loja passa a ser 'propria', o país que os produtos dela têm veio da
// época de marketplace e está errado. É a mesma autoridade que
// pipeline.py::_resolve_identity já aplica durante a coleta.
//
// `storeByProduct` mapeia produto -> país da loja própria que o vende. Um
// produto vendido por duas lojas próprias é caso degenerado (marcas
// diferentes); quem monta o mapa resolve isso com ordem determinística.
export function planOwnStoreCountries(
  products: ProductForCountry[],
  countryByProduct: Map<string, string>,
): CountryPatch[] {
  const patches: CountryPatch[] = [];
  for (const p of products) {
    const country = countryByProduct.get(p.id);
    if (!country) continue;
    const attrs = { ...(p.attributes ?? {}) };
    // Só gera patch quando de fato muda — senão toda execução reescreveria
    // todos os produtos de loja própria (o mesmo cuidado que o pipeline tomou
    // pra não gerar update inútil a cada coleta).
    if (attrs.pais === country) continue;
    patches.push({ id: p.id, attributes: { ...attrs, pais: country }, rule: "own-store" });
  }
  return patches;
}

// ── Regra B: completar pela marca ────────────────────────────────────
//
// Para produto SEM país, usa o valor mais comum entre produtos da MESMA marca.
// Fill-only por natureza: é uma inferência, não uma autoridade, então nunca
// sobrescreve um país já gravado (pode ter sido curado à mão).
//
// Porte de scraper/enrich.py::unify_brand_country. Recebe `alreadyPatched` pra
// enxergar o resultado da regra A na mesma passada — rodar A antes de B é o que
// dá a B uma base melhor (mesma ordem do scraper em run.py).
export function planBrandCountries(
  products: ProductForCountry[],
  alreadyPatched: Map<string, Record<string, string | number>> = new Map(),
): CountryPatch[] {
  const effectiveAttrs = (p: ProductForCountry) => alreadyPatched.get(p.id) ?? p.attributes ?? {};

  const byBrand = new Map<string, ProductForCountry[]>();
  for (const p of products) {
    if (!p.brand) continue;
    const list = byBrand.get(p.brand);
    if (list) list.push(p);
    else byBrand.set(p.brand, [p]);
  }

  const patches: CountryPatch[] = [];
  for (const items of byBrand.values()) {
    const counts = new Map<string, number>();
    for (const p of items) {
      const pais = effectiveAttrs(p).pais;
      if (typeof pais === "string" && pais.trim()) {
        counts.set(pais, (counts.get(pais) ?? 0) + 1);
      }
    }
    if (counts.size === 0) continue;
    // Empate resolvido pelo nome do país, pra o resultado não depender da
    // ordem em que o banco devolveu as linhas.
    const common = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];

    for (const p of items) {
      const attrs = { ...effectiveAttrs(p) };
      const pais = attrs.pais;
      if (typeof pais === "string" && pais.trim()) continue;
      patches.push({ id: p.id, attributes: { ...attrs, pais: common }, rule: "brand" });
    }
  }
  return patches;
}

// Aplica A e depois B, devolvendo um patch por produto (o de A vence se as
// duas regras alcançarem o mesmo produto — A é autoridade, B é inferência).
export function planCountryRewrite(
  products: ProductForCountry[],
  countryByProduct: Map<string, string>,
): { patches: CountryPatch[]; ownStore: number; byBrand: number } {
  const ownStore = planOwnStoreCountries(products, countryByProduct);
  const applied = new Map(ownStore.map((p) => [p.id, p.attributes]));
  const byBrand = planBrandCountries(products, applied).filter((p) => !applied.has(p.id));

  return { patches: [...ownStore, ...byBrand], ownStore: ownStore.length, byBrand: byBrand.length };
}
