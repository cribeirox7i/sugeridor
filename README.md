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

Fases 0 a 3 do roadmap concluídas e em produção, mais uma reforma de UX, lotes de melhoria mobile,
a correção de uma queda em produção e uma leva de trabalho sobre identidade de produto, escala do
scraper e ferramentas de curadoria — ver [docs/05-roadmap.md](docs/05-roadmap.md) para o detalhe.

- Catálogo público com filtros (estilo, país, **marca**, preço, loja, busca por texto, ordenação)
  numa barra fixa, página de produto com histórico de preço, popup de produto, tema claro/escuro,
  pt/en/es.
- **O nome do produto é marca + descritivo** — "Dogma IPA", não "IPA" — em Title Case, com siglas de
  estilo preservadas. Em loja própria a marca vem do apelido da loja e é prefixada ao nome quando
  falta. O `canonical_slug` é a identidade do produto e inclui a marca de propósito, para não
  agregar ofertas de produtos diferentes de mesmo nome.
- Admin com 6 telas: Início, **Lojas** (CRUD + seleção em lote + disparo da coleta + histórico de
  execuções — absorveu a antiga tela Coleta), Produtos, Ofertas, Classificação (palavras-chave de
  categoria) e **Ferramentas** (ações de curadoria em lote e regras de/para). Config concentra
  alertas, expiração e logomarca.
- Scraper Python config-driven por plataforma (vtex/shopify/tray/jsonld/html/txt), disparado
  manualmente via GitHub Actions em **4 shards paralelos**, com rate limit por host, gravação em
  lote no banco, leituras paginadas, guard-rail de 200 produtos/loja, classificação de categoria por
  palavra-chave (editável no admin), expiração com prazo por loja e coleta seletiva por loja.
- `price_history` recebe ponto **só quando o preço muda**; a queda percentual é materializada em
  `offers.drop_percent` por trigger, então a home não carrega histórico a cada render.
- Preço inválido (`<= 0`) nunca é gravado — descartado na aplicação e bloqueado por constraint no
  banco (defesa em profundidade).
- Migrations aplicadas: `0001` a `0015`.

**Pausado por decisão do usuário** (evitar dependência de API paga do Claude por ora): Fase 4
(e-mail como fonte), Fase 5 (WhatsApp via print+OCR), e envio de e-mail de verdade para os
alertas de preço. Retomar só quando/se o usuário pedir explicitamente.
