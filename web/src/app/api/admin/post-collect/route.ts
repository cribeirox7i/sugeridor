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
  if (request.headers.get("authorization") !== `Bearer ${token}`) {
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
