import { readFile } from "node:fs/promises";
import path from "node:path";

// Servido como função, não como arquivo estático (`icon.png`) — um arquivo
// estático dentro de [locale] (rota com generateStaticParams) quebrava o
// build do Next 16/Turbopack: "failed to find source route .../icon.png for
// prerender". Como função, cai no caminho documentado pra ícone em segmento
// dinâmico (ver app-icons.md — params/generateImageMetadata), e o arquivo em
// si mora fora da árvore de rotas, em public/icons.
export const size = { width: 256, height: 256 };
export const contentType = "image/png";

export default async function icon() {
  const data = await readFile(path.join(process.cwd(), "public/icons/icon-256.png"));
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": "image/png" },
  });
}
