import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProductBySlug, getActiveOffersForProduct, getPriceHistoryForProduct } from "@/lib/queries";
import ProductDetailView from "@/components/ProductDetailView";

// Busca por slug + renderiza via ProductDetailView. Usado pela página cheia
// (app/[locale]/produto/[slug]/page.tsx, pra link direto/compartilhamento) e,
// como fallback, pelo popup da home quando o produto não está no catálogo
// ativo já carregado por ela (ver page.tsx) — o caminho comum do popup
// deriva os mesmos dados em memória, sem passar por aqui.
export default async function ProductDetail({ slug }: { slug: string }) {
  const supabase = await createClient();

  const product = await getProductBySlug(supabase, slug);
  if (!product) notFound();

  const [offers, history] = await Promise.all([
    getActiveOffersForProduct(supabase, product.id),
    getPriceHistoryForProduct(supabase, product.id),
  ]);

  return <ProductDetailView product={product} offers={offers} history={history} />;
}
