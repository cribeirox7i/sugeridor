import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Recebe a response que o middleware de i18n já preparou (rewrite/redirect de
// locale) e escreve os cookies de sessão nela, em vez de criar uma nova —
// senão perderíamos o trabalho do next-intl. loginPath/homePath já vêm com o
// prefixo de locale resolvido pelo caller (proxy.ts).
export async function updateSession(
  request: NextRequest,
  response: NextResponse,
  loginPath: string,
  homePath: string,
): Promise<NextResponse> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // A própria página de login fica fora da proteção — senão redireciona pra si
  // mesma em loop quando não há usuário.
  const isLoginPage = request.nextUrl.pathname === loginPath;

  if (!user && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = loginPath;
    return NextResponse.redirect(url);
  }

  // Já logado abrindo a tela de login? Manda pro painel.
  if (user && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = homePath;
    return NextResponse.redirect(url);
  }

  return response;
}
