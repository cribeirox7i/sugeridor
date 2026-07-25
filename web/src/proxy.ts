import createMiddleware from "next-intl/middleware";
import { type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { updateSession } from "@/lib/supabase/middleware";

const handleI18nRouting = createMiddleware(routing);

export async function proxy(request: NextRequest) {
  // Resolve o locale (detecção por Accept-Language + cookie de override,
  // rewrite/redirect pro path prefixado) primeiro — roda em toda página.
  const response = handleI18nRouting(request);

  const localeMatch = request.nextUrl.pathname.match(/^\/([a-z]{2})(\/|$)/);
  const locale = localeMatch ? localeMatch[1] : routing.defaultLocale;
  const pathWithoutLocale = request.nextUrl.pathname.replace(/^\/[a-z]{2}/, "") || "/";

  // Sessão do admin só é checada dentro de /admin — páginas públicas não
  // pagam o custo de uma chamada de auth a cada request.
  if (!pathWithoutLocale.startsWith("/admin")) {
    return response;
  }

  return updateSession(request, response, `/${locale}/admin/login`, `/${locale}/admin`);
}

export const config = {
  // Roda em toda página (pra detecção de locale), exceto API, /go (rota
  // técnica de redirecionamento — fica FORA de [locale] de propósito, ver
  // docs/02-arquitetura.md; sem essa exclusão o next-intl redirecionava
  // /go/<id> pra /pt/go/<id>, que não existe, e dava 404 em vez de sair pra
  // loja de origem), assets internos do Next e arquivos estáticos (com
  // extensão).
  matcher: ["/((?!api|go|_next|_vercel|.*\\..*).*)"],
};
