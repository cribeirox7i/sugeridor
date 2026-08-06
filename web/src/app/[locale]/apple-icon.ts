import { readFile } from "node:fs/promises";
import path from "node:path";

// Mesmo motivo de icon.ts: função em vez de arquivo estático, pra não
// quebrar o build (invariant de prerender do Next/Turbopack pra arquivo de
// ícone estático dentro de rota com generateStaticParams).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function appleIcon() {
  const data = await readFile(path.join(process.cwd(), "public/icons/apple-touch-icon.png"));
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": "image/png" },
  });
}
