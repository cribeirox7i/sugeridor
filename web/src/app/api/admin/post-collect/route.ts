import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/serviceClient";
import { revalidateAllLocales } from "@/lib/revalidate";
import { runPostCollectionAutomation } from "@/lib/postCollect";

// Chamada pelo job `enrich` do workflow do GitHub Actions, depois que a coleta
// inteira termina (ver .github/workflows/scrape.yml) — nunca pelo navegador.
// Não há sessão de admin nesse contexto (o disparo vem de uma Action, não de
// alguém logado), então a autenticação é um token compartilhado (`AUTOMATION_TOKEN`,
// o mesmo valor cadastrado como secret no repositório do GitHub) e a escrita
// usa a service_role key (`createServiceClient`, ignora RLS) em vez do cliente
// de cookie que as Server Actions do admin usam.
export async function POST(request: Request) {
  const token = process.env.AUTOMATION_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "Automação não configurada (falta AUTOMATION_TOKEN no servidor)." },
      { status: 503 },
    );
  }
  const provided = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${token}`;
  const enc = new TextEncoder();
  const providedBytes = enc.encode(provided.padEnd(expected.length, "\0"));
  const expectedBytes = enc.encode(expected.padEnd(provided.length, "\0"));
  const lengthMatch = provided.length === expected.length;
  // crypto.subtle.timingSafeEqual não existe no Edge Runtime; Buffer.compare
  // também não — a abordagem portável no Web Crypto é comparar HMAC de ambos.
  // Aqui usamos XOR manual com padding de mesmo tamanho, que evita early-exit
  // e é suficiente para prevenir timing attack prático neste contexto.
  let diff = lengthMatch ? 0 : 1;
  for (let i = 0; i < Math.max(providedBytes.length, expectedBytes.length); i++) {
    diff |= (providedBytes[i] ?? 0) ^ (expectedBytes[i] ?? 0);
  }
  if (diff !== 0) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Automação não configurada (falta SUPABASE_SERVICE_ROLE_KEY no servidor)." },
      { status: 503 },
    );
  }

  try {
    const result = await runPostCollectionAutomation(supabase);
    if (result.changed) {
      revalidateAllLocales("/admin/ferramentas");
      revalidateAllLocales("/admin/produtos");
      revalidateAllLocales("/");
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
