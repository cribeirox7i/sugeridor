import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Cliente com a service_role key — ignora RLS. Só existe pra rotas internas
// chamadas SEM sessão de admin (ex: a automação pós-coleta, disparada pelo
// GitHub Actions depois do enrich, sem cookie de login nenhum). As Server
// Actions normais do admin continuam usando o cliente de
// `lib/supabase/server.ts` (anon key + cookie de sessão) — este aqui nunca
// deve ser importado por um Client Component nem devolvido ao browser: a
// service_role key dá acesso total ao banco, ignorando toda RLS.
export function createServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
