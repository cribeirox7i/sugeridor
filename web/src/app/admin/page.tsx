import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

export default async function AdminHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen bg-neutral-950 p-8 text-neutral-100">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Admin — Sugeridor</h1>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-900"
            >
              Sair
            </button>
          </form>
        </div>

        <p className="text-neutral-400">
          Logado como <span className="text-neutral-100">{user?.email}</span>
        </p>

        <div className="rounded-lg border border-dashed border-neutral-800 p-6 text-sm text-neutral-500">
          Próximas telas: cadastro manual de produtos/ofertas, botão &quot;Rodar coleta&quot;
          (dispara o workflow de scraping no GitHub Actions), upload de print do WhatsApp,
          configuração de alertas de preço.
        </div>
      </div>
    </div>
  );
}
