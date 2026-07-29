// Largura da área útil das páginas públicas, num lugar só.
//
// Existe como constante porque o desalinhamento entre o conteúdo e o rodapé já
// aconteceu antes: eram quatro literais `max-w-[...]` espalhados (header, barra
// de filtros, conteúdo e Footer) e mudar a largura significava lembrar dos
// quatro. Agora quem precisa da faixa central importa isto.
//
// 976px = os 860px anteriores + 116px (~3cm na mesma escala usada quando o
// admin foi de `max-w-5xl` para `max-w-[1140px]`). É o que faz caber 5 cards de
// produto por linha no desktop.
export const PUBLIC_CONTAINER = "mx-auto w-full max-w-[976px] px-6";
