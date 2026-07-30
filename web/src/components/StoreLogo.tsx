// Selo branco com cantos arredondados por trás da logo da loja, fixo nos dois
// temas (não `dark:bg-*`) — sem isso um PNG com fundo transparente "sangra"
// pro fundo escuro do card no tema dark, enquanto um PNG com fundo branco
// embutido já aparecia bem; um fundo branco FIXO resolve os dois de uma vez,
// dando um visual padrão pra qualquer logo, venha ela como vier. Mesmo
// princípio aplicado à imagem de produto (ver OfferCard/FeaturedDeals/
// ProductDetailView, que já tinham container próprio e só precisaram trocar
// a cor de fundo).
//
// `size` é a classe de tamanho do selo (ex: "h-8 w-8") — cada tela usa um
// tamanho diferente (h-4 na pílula do carrossel, h-16 no cabeçalho da loja).
// Quem chama decide o fallback (emoji, iniciais, nome) quando não há logo —
// este componente só cuida de quando HÁ.
export default function StoreLogo({
  src,
  alt,
  size,
  className,
}: {
  src: string;
  alt: string;
  size: string;
  className?: string;
}) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded bg-white p-0.5 ${size} ${className ?? ""}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="h-full w-full object-contain" />
    </span>
  );
}
