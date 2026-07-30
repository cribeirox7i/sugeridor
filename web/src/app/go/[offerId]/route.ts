import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";

// Mensagem pré-formatada pro wa.me — esta rota fica FORA do `[locale]` (é
// técnica, não conteúdo), então não tem o contexto automático do next-intl.
// Só 3 strings, direto do cookie que o próprio next-intl grava
// (`NEXT_LOCALE`, ver i18n/routing.ts) — não precisa da máquina de tradução
// inteira pra isso.
const WHATSAPP_MESSAGE: Record<string, (product: string, price: string) => string> = {
  pt: (p, price) => `Olá, vi a oferta de ${p} por ${price} no Sugeridor. Ainda está disponível?`,
  en: (p, price) => `Hi, I saw the offer for ${p} at ${price} on Sugeridor. Is it still available?`,
  es: (p, price) => `Hola, vi la oferta de ${p} por ${price} en Sugeridor. ¿Todavía está disponible?`,
};

// Redireciona pro link de venda da loja. Toda saída do site passa por aqui, pra
// que no futuro (programas de afiliado) só esta rota precise mudar: ela passará
// a envelopar a URL com o link_template do affiliate_program da loja, sem tocar
// em nenhum link do catálogo. Ver docs/02-arquitetura.md e docs/03-modelo-dados.md.
//
// Loja "vendedor WhatsApp" (migration 0020, stores.whatsapp_number): não tem
// link de produto (offers.url pode ser null pra essas lojas) — o destino
// passa a ser o wa.me da loja, com uma mensagem citando produto e preço.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ offerId: string }> },
) {
  const { offerId } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("offers")
    .select(
      "url, price, currency, product:products ( name ), store:stores ( affiliate_program_id, whatsapp_number )",
    )
    .eq("id", offerId)
    .maybeSingle();

  // supabase-js infere relação embutida como array quando não há tipos
  // gerados do schema — mesma cautela de outros selects aninhados no projeto.
  const offer = data as unknown as {
    url: string | null;
    price: number;
    currency: string;
    product: { name: string } | null;
    store: { affiliate_program_id: string | null; whatsapp_number: string | null } | null;
  } | null;

  if (!offer) {
    return NextResponse.redirect(new URL("/", _req.url));
  }

  // `url` vence quando presente (loja mista, improvável mas não proibida
  // pelo schema) — é o comportamento que já existia antes desta migration.
  if (offer.url) {
    // Futuro: se offer.store.affiliate_program_id apontar pra um programa
    // ativo, montar a URL final com affiliate_programs.link_template.
    return NextResponse.redirect(offer.url);
  }

  const whatsappNumber = offer.store?.whatsapp_number;
  if (whatsappNumber && offer.product) {
    const cookieStore = await cookies();
    const locale = cookieStore.get("NEXT_LOCALE")?.value ?? "pt";
    const template = WHATSAPP_MESSAGE[locale] ?? WHATSAPP_MESSAGE.pt;
    const text = template(offer.product.name, formatPrice(offer.price, offer.currency));
    return NextResponse.redirect(
      `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(text)}`,
    );
  }

  // Nem url nem WhatsApp — oferta mal cadastrada (não devia acontecer, a
  // validação em ofertas/actions.ts já exige um dos dois). Volta pro catálogo
  // em vez de 404, mesmo espírito de antes.
  return NextResponse.redirect(new URL("/", _req.url));
}
