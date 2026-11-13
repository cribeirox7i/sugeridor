import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Ofertas ativas de um produto, pra popular o popover "Outras lojas" do card
// sob demanda (só busca quando o usuário abre). Público — mesmo dado que já
// aparece no catálogo, só filtrado por produto.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const { productId } = await params;
  if (!UUID_RE.test(productId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("offers")
    .select("id, price, currency, store:stores ( id, name )")
    .eq("product_id", productId)
    .eq("active", true)
    .order("price", { ascending: true })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ offers: data ?? [] });
}
