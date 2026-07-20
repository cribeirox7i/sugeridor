import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Só roda no /admin: as páginas públicas do catálogo não precisam de sessão
  // e não devem pagar o custo de uma chamada de auth a cada request.
  matcher: ["/admin/:path*"],
};
