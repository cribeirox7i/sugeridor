import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

// Tela Início removida (item 5 da leva de melhorias, 2026-07-30): cada tela
// (Lojas/Produtos/Ofertas) agora mostra a própria contagem no cabeçalho, sem
// precisar de uma tela própria só pra somar 3 números. A rota /admin continua
// existindo (não 404) pra quem tiver o link salvo — só redireciona.
export default async function AdminHome() {
  const locale = await getLocale();
  redirect(`/${locale}/admin/lojas`);
}
