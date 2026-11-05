// Detecção de produtos que são o MESMO produto sob identificadores diferentes.
// Lógica pura, sem I/O, pra dar pra conferir contra o catálogo real sem banco —
// mesmo padrão de `planReplacements` e `planMerge`.
import { brandTokens, fold, matchKey, matchKeyParts } from "./slug";

export type DuplicateCandidate = {
  id: string;
  name: string;
  brand: string | null;
  canonical_slug: string;
};

// Agrupa por NOME (ignorando acento, caixa e pontuação) os produtos que têm
// `canonical_slug` diferente — ou seja, dois registros distintos no banco pra
// uma coisa só.
//
// Por que o nome e não o slug: o slug já é unique, então duplicata por slug não
// existe. O que existe é duplicata por identificador que MUDOU. O caso que
// motivou isto: o coletor Tray passou a gravar `brand`, e a marca entra no slug
// quando o nome não a contém — "Belga Duvel 330ml" com marca "Duvel Moortgat"
// passou de `belga-duvel-330ml` pra `duvel-moortgat-belga-duvel-330ml`. A coleta
// seguinte não reconheceu o produto pelo slug novo, criou outro, e os dois
// ficaram com oferta ATIVA da mesma loja (o unique de `offers` é
// (product_id, store_id), então nada no banco impede). No site apareciam os
// dois: um completo e um sem marca, sem imagem e com o preço congelado.
//
// A mesma coisa acontece sempre que a marca é descoberta depois, o nome é
// corrigido à mão, ou a fórmula do slug muda — por isso a detecção olha o nome,
// que é o que permanece, e não o identificador, que é o que se move.
//
// Grupos vêm ordenados por nome, e cada grupo preserva a ordem recebida (a
// escolha de quem fica é de `chooseKeeper`, em lib/merge.ts).
export function groupByName<T extends DuplicateCandidate>(products: T[]): T[][] {
  const byName = new Map<string, T[]>();
  for (const p of products) {
    const key = fold(p.name);
    if (!key) continue;
    const list = byName.get(key);
    if (list) list.push(p);
    else byName.set(key, [p]);
  }

  const groups: T[][] = [];
  for (const list of byName.values()) {
    // Mais de um registro com o mesmo nome só é duplicata se os slugs
    // divergirem — e como o slug é unique, dois registros nunca compartilham o
    // mesmo. A checagem fica como documentação da invariante.
    if (list.length < 2) continue;
    if (new Set(list.map((p) => p.canonical_slug)).size < 2) continue;
    groups.push(list);
  }

  return groups.sort((a, b) => a[0].name.localeCompare(b[0].name, "pt-BR"));
}

// Agrupa pela match_key: o MESMO produto sob nomes diferentes entre lojas
// ("Garrafa"/"Belga"/ordem/marca cervejaria vs rótulo). É um SUPERCONJUNTO de
// groupByName — nomes idênticos têm match_key idêntica, então tudo que
// groupByName pegaria, este também pega, e mais os casos que só diferem por
// embalagem/descritor/ordem. É a razão de esta tela existir: sem agregar esses,
// o mesmo produto aparece como N cards no site.
//
// Mesma regra de groupByName: só é duplicata se os canonical_slug divergirem
// (slug é unique, então registros distintos nunca compartilham o mesmo).
export function groupByMatchKey<T extends DuplicateCandidate>(products: T[]): T[][] {
  const byKey = new Map<string, T[]>();
  for (const p of products) {
    const key = matchKey(p.brand, p.name);
    if (!key) continue;
    const list = byKey.get(key);
    if (list) list.push(p);
    else byKey.set(key, [p]);
  }

  const groups: T[][] = [];
  for (const list of byKey.values()) {
    if (list.length < 2) continue;
    if (new Set(list.map((p) => p.canonical_slug)).size < 2) continue;
    groups.push(list);
  }

  return groups.sort((a, b) => a[0].name.localeCompare(b[0].name, "pt-BR"));
}

// Agrupa produtos cujo CONJUNTO de tokens da match_key é superconjunto estrito
// de outro, no mesmo volume — o caso que a match_key exata não pega: uma loja
// embutiu a cervejaria no nome ("Argentum Huyghe Delirium" vs "Delirium
// Argentum"), então um token a mais separa produtos iguais. É sinal MAIS FRACO
// que groupByMatchKey (daí uma seção própria, "possíveis duplicatas"): nada é
// mesclado sozinho, é sempre revisão humana.
//
// Guardas contra over-merge (todas necessárias — medidas contra o catálogo
// real, onde a versão sem a última regra juntava coisas MUITO diferentes):
//  * mesmo volume (330ml e 750ml do "mesmo" rótulo são produtos diferentes);
//  * o lado MENOR precisa de >= 2 tokens — sem isso um nome genérico de 1 token
//    ("delirium") engoliria todo produto específico que o contém
//    ("delirium-nocturnum", "delirium-tremens"), que é o oposto do certo;
//  * contenção ESTRITA (um conjunto contém todo o outro e é maior), não só
//    "compartilham 2 palavras";
//  * **a palavra que SOBRA tem que ser nome de cervejaria** (estar na marca de
//    um dos dois). Sem esta, "um token a mais" pegava variante e SKU como se
//    fosse duplicata: Paulaner Hefe Weiss + "Dunkel" (cerveja escura),
//    + "Alkoholfrei" (sem álcool), + "Pack 6 Cervejas" (outro SKU) caíam todos
//    no mesmo grupo. Cervejaria no nome é ruído; variante não é.
//
// Componentes conexos por essa relação (A⊂C e B⊂C caem no mesmo grupo), via
// union-find. Só entra grupo com >= 2 slugs distintos, igual às outras listas.
export function groupByContainedMatchKey<T extends DuplicateCandidate>(products: T[]): T[][] {
  type Item = { p: T; tokens: Set<string>; volKey: string; brand: Set<string> };
  const items: Item[] = [];
  for (const p of products) {
    const { tokens, volume } = matchKeyParts(p.brand, p.name);
    // Lado menor precisa de >= 2 tokens, então só produtos com >= 2 tokens
    // podem formar aresta — descarta os de 1 token (genéricos/marca pelada).
    if (tokens.length < 2) continue;
    items.push({
      p,
      tokens: new Set(tokens),
      volKey: volume ? `${volume}ml` : "",
      brand: new Set(brandTokens(p.brand)),
    });
  }

  // union-find sobre índices
  const parent = items.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  // `small` cabe inteiro em `big` E tudo que sobra em `big` é nome de
  // cervejaria (da marca de um dos dois). O segundo teste é o que separa
  // "Argentum Huyghe Delirium" (sobra "huyghe" = a marca do outro: ruído) de
  // "Paulaner Hefe Weiss Dunkel" (sobra "dunkel": variante, produto diferente).
  const contains = (small: Item, big: Item): boolean => {
    if (small.tokens.size >= big.tokens.size) return false;
    for (const t of small.tokens) if (!big.tokens.has(t)) return false;
    for (const t of big.tokens) {
      if (small.tokens.has(t)) continue;
      if (!small.brand.has(t) && !big.brand.has(t)) return false;
    }
    return true;
  };

  // Só compara dentro do mesmo balde de volume — produtos de volumes
  // diferentes nunca são a mesma unidade de venda.
  const byVol = new Map<string, number[]>();
  items.forEach((it, i) => {
    const list = byVol.get(it.volKey);
    if (list) list.push(i);
    else byVol.set(it.volKey, [i]);
  });

  for (const idxs of byVol.values()) {
    for (let a = 0; a < idxs.length; a++) {
      for (let b = a + 1; b < idxs.length; b++) {
        const i = idxs[a];
        const j = idxs[b];
        if (contains(items[i], items[j]) || contains(items[j], items[i])) {
          union(i, j);
        }
      }
    }
  }

  const byRoot = new Map<number, T[]>();
  items.forEach((it, i) => {
    const r = find(i);
    const list = byRoot.get(r);
    if (list) list.push(it.p);
    else byRoot.set(r, [it.p]);
  });

  const groups: T[][] = [];
  for (const list of byRoot.values()) {
    if (list.length < 2) continue;
    if (new Set(list.map((p) => p.canonical_slug)).size < 2) continue;
    groups.push(list);
  }

  return groups.sort((a, b) => a[0].name.localeCompare(b[0].name, "pt-BR"));
}

// ── Pares ignorados ──────────────────────────────────────────────────
//
// O par é sempre CANÔNICO (id menor primeiro), igual ao check da tabela
// `ignored_duplicates` (migration 0017): sem isso o mesmo par seria gravado
// duas vezes, invertido, e a checagem de "já ignorei este?" falharia metade
// das vezes.
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// Todos os pares internos de um grupo. Um grupo de 2 tem 1 par; de 3 tem 3.
export function groupPairs(ids: string[]): [string, string][] {
  const pairs: [string, string][] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      pairs.push(ids[i] < ids[j] ? [ids[i], ids[j]] : [ids[j], ids[i]]);
    }
  }
  return pairs;
}

// Um grupo só sai da tela quando TODOS os seus pares estão ignorados.
//
// Importa para grupo de 3+: ignorar A-B não diz nada sobre C. Se bastasse um
// par ignorado, o grupo inteiro desapareceria e a duplicata A-C ficaria
// escondida pra sempre — o oposto do que a tela existe pra fazer.
export function isGroupIgnored(ids: string[], ignored: Set<string>): boolean {
  const pairs = groupPairs(ids);
  return pairs.length > 0 && pairs.every(([a, b]) => ignored.has(pairKey(a, b)));
}
