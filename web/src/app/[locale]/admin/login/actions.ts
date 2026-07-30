"use server";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  const locale = await getLocale();

  if (error) {
    redirect(`/${locale}/admin/login?error=${encodeURIComponent(error.message)}`);
  }

  // Tela Início foi removida (item 5 da leva de melhorias) — Lojas é o novo
  // destino padrão pós-login, evita um redirect extra pela raiz de /admin.
  redirect(`/${locale}/admin/lojas`);
}
