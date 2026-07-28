// Detecção de produtos que são o MESMO produto sob identificadores diferentes.
// Lógica pura, sem I/O, pra dar pra conferir contra o catálogo real sem banco —
// mesmo padrão de `planReplacements` e `planMerge`.
import { fold } from "./slug";

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
