# Roadmap

Você pediu pra planejar as 4 fontes de dados desde o início, então a arquitetura (schema,
conectores, normalizador de IA) já é desenhada pra suportar todas. Isso não significa escrever
código de tudo ao mesmo tempo — a ordem original abaixo mudou na prática (uma reforma de UX e
lotes de melhoria mobile entraram entre as fases 2 e 3), mas a base (banco + normalizador +
matching) segue servindo igual pra qualquer conector.

## Fase 0 — Fundação ✅ concluída
- Criar projeto Next.js + repositório.
- Criar projeto Supabase, rodar migrations do schema ([03-modelo-dados.md](03-modelo-dados.md)).
- Configurar Supabase Auth (login do admin).
- Deploy inicial no Vercel.

## Fase 1 — Catálogo + cadastro manual ✅ concluída
- Telas públicas: listagem de ofertas com filtro (estilo, país, preço, loja).
- Página de detalhe do produto com histórico de preço.
- Admin: CRUD de produtos/ofertas/lojas manual.
- Rota `/go/[offer_id]` de redirecionamento (pronta pra afiliados no futuro).

## Fase 2 — Scraping ✅ concluída
- Scraper Python **config-driven por plataforma** (vtex/shopify/tray/jsonld/html/txt) — evoluiu
  do plano original de "um módulo por loja" pra plataforma+config, ver
  [scraper/README.md](../scraper/README.md).
- Botão "Rodar coleta" no admin, disparando o workflow do GitHub Actions (`workflow_dispatch`).
- Matching/dedup por slug ligado; normalizador via Claude API **não foi necessário** até agora —
  os coletores por plataforma já extraem campos estruturados direto (jsonld inclusive extrai
  país/estilo/ABV via bloco de atributos da FBits).
- Agendamento automático (cron) segue não implementado — disparo continua manual por decisão do
  usuário.

## Reforma de UX (não estava no roadmap original) ✅ concluída
Feita entre as fases 2 e 3, em 5 etapas: tema claro/escuro (padrão claro), i18n pt/en/es
(detecção por Accept-Language), carrossel de ofertas em destaque, sparkline + popover de lojas no
card de oferta, admin reescrito em grid de cards + modal.

## Fase 3 — Histórico de preço + alertas ✅ concluída
- Migration `0005`: trigger no Postgres (`evaluate_price_alerts()`) calcula preço de referência e
  grava `alert_triggers` com dedup de 24h.
- Tela `/admin/alertas` (feed de disparos).
- Selo público "-X%" na listagem/produto, independente de regra configurada.
- **Pendente**: envio de e-mail de verdade (`notify_channel = 'email'` já grava no schema, mas
  nada dispara ainda) — pausado, ver nota abaixo.

## Melhorias mobile + UX geral (não estava no roadmap original) ✅ concluída
Lote de 15 itens após teste em celular: card de oferta reestruturado, acordeon de filtros no
mobile, popup de produto, auto-extração de logo/descrição da loja, checklist de inclusão na
coleta, carrossel de lojas + "página da loja".

## Fase 4 — E-mail ⏸️ pausada
- Caixa dedicada + credenciais IMAP.
- Cron de leitura + normalizador (Claude API) aplicado a e-mails com múltiplas ofertas por
  mensagem.
- **Pausada em 2026-07-25 por decisão do usuário**: depende de Claude API paga (sem plano
  gratuito robusto pra essa extração) e o usuário optou por não contratar por ora. Não é recusa
  definitiva — retomar só se o usuário pedir, perguntando antes se a posição sobre custo/chave
  mudou.

## Fase 5 — WhatsApp via print/OCR ⏸️ pausada
- Tela de upload no admin.
- Integração com Claude API (visão) pra extrair `CandidatoOferta` do print.
- Fila de revisão manual pra prints que a IA não conseguiu extrair com confiança.
- **Mesma pausa e mesmo motivo da Fase 4** (depende de Claude API paga).

## Fase 6 — Preparar generalização pra outros produtos
- Cadastrar um segundo `product_type` (ex: vinho) só com atributos diferentes, sem migração,
  pra provar que a engine é de fato genérica antes de anunciar isso como feature.
- Ainda não iniciada.

## Fora do escopo por enquanto (mencionar mas não construir)
- Integração de fato com programas de afiliados (estrutura já existe, ativar quando entrar em
  algum programa).
- App mobile / push notification nativo.
