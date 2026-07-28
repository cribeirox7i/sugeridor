// Regras de/para aplicadas sob demanda em nome/marca de produto (tabela
// `text_replacements`, migration 0014). Lógica pura, sem I/O, pra dar pra
// testar contra os nomes reais do catálogo sem depender do banco — mesmo
// padrão de `computeFeaturedDeals`/`titleCaseProductName`.
import { productSlug } from "./slug";

export type Replacement = {
  id: string;
  target: "name" | "brand";
  search: string;
  replace: string;
  active: boolean;
  created_at: string;
};

// Regras aplicadas em cadeia: o resultado depende da ORDEM (remover " Garrafa "
// antes ou depois de separar o volume dá strings diferentes). A tela e a ação de
// aplicar precisam usar a mesma, senão o número que a tela mostra não é o que a
// ação faz. Ordena por criação, que é a única ordem que o usuário consegue
// prever — a do banco não é garantida sem `order by`.
export function sortRules(rules: Replacement[]): Replacement[] {
  return [...rules].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
}

export type ProductForReplace = {
  id: string;
  name: string;
  brand: string | null;
  canonical_slug: string;
};

export type ReplaceResult = {
  id: string;
  name: string;
  brand: string | null;
  canonical_slug: string;
  changed: boolean;
};

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Fronteira de palavra nas pontas, com uma exceção importante para números.
//
// A fronteira existe porque sem ela a regra "pin" transforma "CONSTELLATION
// SPIN" em "CONSTELLATION S". Só é exigida na ponta que de fato começa ou
// termina com letra/número: a regra "Alemã " termina em espaço, e cobrar
// fronteira depois dele nunca casaria.
//
// A exceção: quando a ponta é um DÍGITO, a fronteira não é exigida — porque o
// caso de uso é justamente separar volume emendado ao nome. São 154 produtos
// assim no catálogo ("Erdinger Urweisse500ml", "Tripel Karmeliet750ml"), e uma
// regra DE "500ml" PARA " 500ml" precisa casar logo depois de uma letra.
// Consequência aceita: a regra também casa dentro de um número maior, o que
// nos dados reais é o resultado desejado ("St. Bernardus Abt 12330ml" vira
// "Abt 12 330ml") — mas convém conferir a contagem de "Afeta" antes de aplicar.
//
// Usa lookaround com classes Unicode em vez de `\b` porque `\b` em JS é ASCII:
// com acento ("Alemã", "Ação") ele marca fronteira no lugar errado.
// Case-insensitive porque a mesma marca aparece em CAIXA ALTA numa loja e
// capitalizada noutra.
function toPattern(search: string): RegExp {
  const escaped = escapeRegex(search);
  const before = /^\p{L}/u.test(search) ? "(?<![\\p{L}\\p{N}])" : "";
  const after = /\p{L}$/u.test(search) ? "(?![\\p{L}\\p{N}])" : "";
  return new RegExp(`${before}${escaped}${after}`, "giu");
}

function applyToText(text: string, rules: Replacement[]): string {
  let out = text;
  for (const rule of rules) {
    out = out.replace(toPattern(rule.search), rule.replace);
  }
  // Substituição com `replace` vazio deixa espaço duplo ou espaço na ponta.
  return out.replace(/\s{2,}/g, " ").trim();
}

// Aplica as regras ativas e devolve o resultado JÁ com o slug recalculado por
// `productSlug` — a MESMA função que o scraper usa (espelhada em
// scraper/normalize.py::product_slug). Usar `slugify(marca + nome)` aqui, como
// era antes, produzia slug diferente do que a coleta calcula ("dogma-dogma-
// ipa" em vez de "dogma-ipa") e a coleta seguinte criaria uma duplicata.
// Recalcular é obrigatório: é pelo slug que o scraper reconhece o produto.
export function applyReplacements(
  products: ProductForReplace[],
  replacements: Replacement[],
): ReplaceResult[] {
  // Ordena aqui, não no caller: aplicar em cadeia depende da ordem, e o número
  // que a tela mostra tem que ser o que a ação grava.
  const active = sortRules(replacements.filter((r) => r.active));
  const nameRules = active.filter((r) => r.target === "name");
  const brandRules = active.filter((r) => r.target === "brand");

  return products.map((p) => {
    const name = nameRules.length ? applyToText(p.name, nameRules) : p.name;
    const brand =
      p.brand && brandRules.length ? applyToText(p.brand, brandRules) || null : p.brand;
    const canonical_slug = productSlug(brand, name);
    return {
      id: p.id,
      name,
      brand,
      canonical_slug,
      changed:
        name !== p.name || brand !== p.brand || canonical_slug !== p.canonical_slug,
    };
  });
}

export type ReplacePlan = {
  // Seguros de aplicar: o slug novo não bate com nenhum outro produto.
  toUpdate: ReplaceResult[];
  // Colidiriam com um produto existente. Não são tocados — viram sugestão de
  // mesclagem, que o usuário decide caso a caso (nada é mesclado sozinho).
  conflicts: { result: ReplaceResult; conflictsWith: string[] }[];
};

// Separa o que dá pra aplicar do que exige decisão humana. Uma colisão de slug
// significa "estes dois registros são o mesmo produto" — e mesclar move
// ofertas e apaga um produto, então é decisão do usuário, não do lote.
export function planReplacements(
  products: ProductForReplace[],
  replacements: Replacement[],
): ReplacePlan {
  const results = applyReplacements(products, replacements);

  // Slug -> ids que TERIAM esse slug depois da substituição. Inclui os que não
  // mudaram, senão uma colisão contra produto intocado passaria batido.
  const bySlug = new Map<string, string[]>();
  for (const r of results) {
    const list = bySlug.get(r.canonical_slug);
    if (list) list.push(r.id);
    else bySlug.set(r.canonical_slug, [r.id]);
  }

  const toUpdate: ReplaceResult[] = [];
  const conflicts: { result: ReplaceResult; conflictsWith: string[] }[] = [];

  for (const r of results) {
    if (!r.changed) continue;
    const sharing = (bySlug.get(r.canonical_slug) ?? []).filter((id) => id !== r.id);
    if (sharing.length > 0) conflicts.push({ result: r, conflictsWith: sharing });
    else toUpdate.push(r);
  }

  return { toUpdate, conflicts };
}
