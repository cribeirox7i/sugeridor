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

Fases 0 a 3 do roadmap concluídas e em produção, além de uma reforma de UX (tema claro/escuro,
i18n pt/en/es, carrossel de destaques, sparkline de preço) e um lote de melhorias mobile — ver
[docs/05-roadmap.md](docs/05-roadmap.md) para o detalhe de cada fase.

- Catálogo público com filtros (estilo, país, preço, loja), página de produto com histórico de
  preço, popup de produto, tema claro/escuro, pt/en/es.
- Admin (grid de cards + modais) com CRUD de lojas/produtos/ofertas, detecção automática de
  plataforma de e-commerce + branding da loja, checklist de inclusão na coleta.
- Scraper Python config-driven por plataforma (vtex/shopify/tray/jsonld/html/txt), disparado
  manualmente via GitHub Actions.
- Alertas de queda de preço (trigger no Postgres), visíveis em `/admin/alertas` — sem envio de
  e-mail de verdade ainda.
- Migrations aplicadas: `0001` a `0006` (schema inicial → branding/site_settings → alertas →
  `include_in_collection`).

**Pausado por decisão do usuário** (evitar dependência de API paga do Claude por ora): Fase 4
(e-mail como fonte), Fase 5 (WhatsApp via print+OCR), e envio de e-mail de verdade para os
alertas de preço. Retomar só quando/se o usuário pedir explicitamente.
