// Chave de sessionStorage usada só pelo popup de produto (ProductCardLink +
// Modal, ver comentários lá): sinaliza que o popup foi aberto por clique no
// grid da home (navegação dentro do site), não por link direto/compartilhado
// com ?produto= na URL — só nesse caso fechar pode usar router.back() em vez
// de push, reaproveitando o cache client-side do router em vez de forçar um
// novo carregamento da home.
export const MODAL_FROM_GRID_KEY = "sugeridor:modalFromGrid";
