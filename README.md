# Sugeridor — Hub de Ofertas

Hub de ofertas de cervejas artesanais e especiais, construído como engine genérica reutilizável
pra outros tipos de produto (vinho, livros, etc.) no futuro.

Em produção: [sugeridor.vercel.app](https://sugeridor.vercel.app) (repo `cribeirox7i/sugeridor`,
branch `main`).

## Documentos

1. [Visão geral](docs/01-visao-geral.md)
2. [Arquitetura](docs/02-arquitetura.md)
3. [Modelo de dados](docs/03-modelo-dados.md)
4. [Conectores de ingestão](docs/04-conectores-ingestao.md)
5. [Roadmap](docs/05-roadmap.md)
6. [Riscos e legal](docs/06-riscos-e-legal.md)

## Stack (resumo)

Next.js 16 (App Router) + Vercel (site, admin, API) · Supabase (Postgres + Auth + Storage) ·
GitHub Actions (scraping em shards paralelos, disparo manual) · Claude API (reservado
pra normalização de dados não estruturados — e-mail/WhatsApp OCR — ainda não ativado, ver roadmap).

## Estado atual

Fases 0 a 3 do roadmap concluídas e em produção, mais uma reforma de UX, lotes de melhoria mobile, a
correção de uma queda em produção e levas de trabalho sobre identidade de produto, escala do scraper,
ferramentas de curadoria e reorganização do catálogo público — ver
[docs/05-roadmap.md](docs/05-roadmap.md) para o detalhe.

- Catálogo público numa **barra de ferramentas única e fixa**: busca, país, "mais filtros e
  ordenação" (estilo, marca, loja, faixa de preço, ordenação) e carrossel de lojas. Grid de 5 cards
  por linha no desktop, área útil de 976px. Página de produto com histórico de preço, popup de
  produto, "página da loja" (`/?loja=`), vitrine **`/lojas`**, tema claro/escuro, pt/en/es. No
  mobile a barra vem recolhida em acordeon.
- **O nome do produto é marca + descritivo** — "Dogma IPA 473 ml", não "IPA" — em Title Case, com
  siglas de estilo preservadas e a **medida separada do número**. Em loja própria a marca vem do
  apelido da loja e é prefixada ao nome quando falta. O `canonical_slug` é a identidade do produto e
  inclui a marca de propósito, para não agregar ofertas de produtos diferentes de mesmo nome.
- Admin com 7 telas: Início, **Lojas** (CRUD + seleção em lote + disparo da coleta + histórico de
  execuções — absorveu a antiga tela Coleta), Produtos, Ofertas, Classificação (palavras-chave de
  categoria), **Ferramentas** (curadoria em lote, regras de/para aplicáveis uma a uma, e duas listas
  de duplicados com mesclar/ignorar em lote) e Config (alertas, expiração e logomarca).
- Scraper Python config-driven por plataforma (vtex/shopify/tray/jsonld/html/txt), disparado
  manualmente via GitHub Actions em **4 shards paralelos**, com rate limit por host, gravação em
  lote no banco, leituras paginadas, guard-rail de 200 produtos/loja, classificação de categoria por
  palavra-chave (editável no admin), expiração com prazo por loja e coleta seletiva por loja.
- **Produto esgotado na loja sai das ofertas na mesma coleta** (shopify/vtex/tray/jsonld — `html` e
  `txt` não expõem esse sinal).
- A plataforma `txt` (último recurso, busca posicional) **não exige escrever JSON à mão**: o
  formulário de loja detecta os delimitadores a partir de um produto de exemplo, ou aceita
  preenchimento manual das tags — os dois com teste contra a página real antes de salvar.
- `price_history` recebe ponto **só quando o preço muda** e só para oferta disponível; a queda
  percentual é materializada em `offers.drop_percent` por trigger, então a home não carrega
  histórico a cada render.
- Preço inválido (`<= 0`) nunca é gravado — descartado na aplicação e bloqueado por constraint no
  banco (defesa em profundidade).
- Migrations aplicadas: `0001` a `0017`.

**Pausado por decisão do usuário** (evitar dependência de API paga do Claude por ora): Fase 4
(e-mail como fonte), Fase 5 (WhatsApp via print+OCR), e envio de e-mail de verdade para os
alertas de preço. Retomar só quando/se o usuário pedir explicitamente.
