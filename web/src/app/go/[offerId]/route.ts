import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Redireciona pro link de venda da loja. Toda saída do site passa por aqui, pra
// que no futuro (programas de afiliado) só esta rota precise mudar: ela passará
// a envelopar a URL com o link_template do affiliate_program da loja, sem tocar
// em nenhum link do catálogo. Ver docs/02-arquitetura.md e docs/03-modelo-dados.md.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ offerId: string }> },
) {
  const { offerId } = await params;
  const supabase = await createClient();

  const { data: offer } = await supabase
    .from("offers")
    .select("url, store:stores ( affiliate_program_id )")
    .eq("id", offerId)
    .maybeSingle();

  if (!offer?.url) {
    return NextResponse.redirect(new URL("/", _req.url));
  }

  // Futuro: se offer.store.affiliate_program_id apontar pra um programa ativo,
  // montar a URL final com affiliate_programs.link_template. Por ora, redirect direto.
  return NextResponse.redirect(offer.url);
}
