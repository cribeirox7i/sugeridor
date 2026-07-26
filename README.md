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
GitHub Actions (scraping, disparado manualmente por um botão no admin) · Claude API (reservado
pra normalização de dados não estruturados — e-mail/WhatsApp OCR — ainda não ativado, ver roadmap).

## Estado atual

Fases 0 a 3 do roadmap concluídas e em produção, mais uma reforma de UX, um lote de melhorias
mobile, uma correção de uma queda em produção e uma leva de refinamentos (categorização, tipo de
loja, layout fixo do site) — ver [docs/05-roadmap.md](docs/05-roadmap.md) para o detalhe de cada
fase.

- Catálogo público com filtros (estilo, país, preço, loja, busca por texto, ordenação por
  preço/nome/país) numa barra fixa (não rola com o conteúdo), página de produto com histórico de
  preço, popup de produto, tema claro/escuro, pt/en/es com bandeiras no seletor de idioma.
- Admin (grid de cards + modais, navbar fixo) com CRUD de lojas (tipo marketplace/própria, país,
  detecção automática de plataforma + branding), produtos (com categoria) e ofertas (data de
  captura, filtro por loja/data, seleção e exclusão em lote), checklist de inclusão na coleta com
  busca por nome.
- Scraper Python config-driven por plataforma (vtex/shopify/tray/jsonld/html/txt), disparado
  manualmente via GitHub Actions, rodando lojas **em paralelo** com rate limit por host,
  guard-rail de 200 produtos/loja por execução, classificação de categoria por palavra-chave,
  expiração automática de ofertas paradas e herança de marca/país pra lojas próprias.
- Preço inválido (`<= 0`) nunca é gravado — descartado na aplicação e bloqueado também por
  constraint no banco (defesa em profundidade).
- Alertas de queda de preço (trigger no Postgres) e parâmetro de expiração de ofertas, ambos em
  `/admin/config` (renomeada de "Alertas") — sem envio de e-mail de verdade ainda.
- Migrations aplicadas: `0001` a `0010`.

**Pausado por decisão do usuário** (evitar dependência de API paga do Claude por ora): Fase 4
(e-mail como fonte), Fase 5 (WhatsApp via print+OCR), e envio de e-mail de verdade para os
alertas de preço. Retomar só quando/se o usuário pedir explicitamente.
