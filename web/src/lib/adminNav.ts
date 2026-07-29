// Preserva o estado da LISTA (modo cartões/lista e a busca) ao navegar dentro
// de uma tela do admin.
//
// Motivo: os links de incluir/editar e o fechar do modal eram caminhos fixos
// (`/admin/lojas?new=1`), então abrir o formulário no modo Cartões devolvia o
// usuário pro modo Lista — o `?view=grid` simplesmente sumia da URL, e a tela
// cai no padrão. O mesmo valia pra busca digitada: abrir e fechar o modal
// perdia o filtro.
//
// Usado pelas três telas com ViewToggle (lojas, produtos, ofertas) e pelas
// Server Actions delas, que redirecionam depois de salvar/excluir.

export type ListParams = { view?: string; q?: string };

// `extra` entra depois, então `?new=1`/`?edit=<id>` sempre aparecem, mesmo se
// alguém passar uma chave repetida.
export function adminUrl(path: string, list: ListParams, extra?: Record<string, string>): string {
  const params = new URLSearchParams();
  if (list.view) params.set("view", list.view);
  if (list.q) params.set("q", list.q);
  for (const [k, v] of Object.entries(extra ?? {})) {
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

// Versão pras Server Actions: os mesmos parâmetros chegam como campos
// escondidos no <form>, porque a action não vê a URL de onde o formulário foi
// submetido.
export function adminUrlFromForm(
  path: string,
  formData: FormData,
  extra?: Record<string, string>,
): string {
  return adminUrl(
    path,
    { view: (formData.get("view") as string) || undefined, q: (formData.get("q") as string) || undefined },
    extra,
  );
}
