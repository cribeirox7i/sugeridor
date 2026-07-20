# Roadmap

Você pediu pra planejar as 4 fontes de dados desde o início, então a arquitetura (schema,
conectores, normalizador de IA) já é desenhada pra suportar todas. Isso não significa escrever
código de tudo ao mesmo tempo — sugestão de ordem de construção abaixo, pra ter algo rodando e
testável o quanto antes, mas nada aqui é bloqueante: a base (banco + normalizador + matching) serve
igual pra qualquer conector, então a ordem pode mudar sem retrabalho.

## Fase 0 — Fundação
- Criar projeto Next.js + repositório.
- Criar projeto Supabase, rodar migrations do schema ([03-modelo-dados.md](03-modelo-dados.md)).
- Configurar Supabase Auth (login do admin).
- Deploy inicial no Vercel (mesmo vazio, pra validar pipeline de deploy cedo).

## Fase 1 — Catálogo + cadastro manual
- Telas públicas: listagem de ofertas com filtro (estilo, país, preço, loja).
- Página de detalhe do produto com histórico de preço (gráfico simples).
- Admin: CRUD de produtos/ofertas/lojas manual.
- Rota `/go/[offer_id]` de redirecionamento (já pronta pra afiliados no futuro).
- Isso sozinho já é um hub funcional, só que 100% alimentado manualmente — útil pra validar o
  schema e a UI antes de plugar automação.

## Fase 2 — Scraping
- Escolher 2-3 lojas iniciais (as que você mais acompanha).
- Escrever o primeiro scraper em Python e o workflow do GitHub Actions com gatilho
  `workflow_dispatch` (manual).
- Botão "Rodar coleta" no admin, chamando a API do GitHub pra disparar o workflow.
- Ligar o normalizador (Claude API) + matching/dedup.
- Validar o pipeline completo: clique no botão → scraper → raw_capture → normalização → offer →
  price_history.
- Agendamento automático (cron) fica pra depois, só se/quando fizer sentido.

## Fase 3 — Histórico de preço + alertas
- Job de cálculo de preço de referência e `drop_percent`.
- Tela de configuração de alerta (`price_alerts`) no admin.
- Notificação (começar simples: e-mail via Resend/Supabase, ou até só um badge "preço baixo" na
  listagem antes de implementar envio de notificação de fato).

## Fase 4 — E-mail
- Caixa dedicada + credenciais IMAP.
- Cron de leitura + normalizador aplicado a e-mails com múltiplas ofertas por mensagem.

## Fase 5 — WhatsApp via print/OCR
- Tela de upload no admin.
- Integração com Claude API (visão) pra extrair `CandidatoOferta` do print.
- Fila de revisão manual pra prints que a IA não conseguiu extrair com confiança.

## Fase 6 — Preparar generalização pra outros produtos
- Cadastrar um segundo `product_type` (ex: vinho) só com atributos diferentes, sem migração,
  pra provar que a engine é de fato genérica antes de anunciar isso como feature.

## Fora do escopo por enquanto (mencionar mas não construir)
- Integração de fato com programas de afiliados (estrutura já existe, ativar quando entrar em
  algum programa).
- App mobile / push notification nativo.
- Multi-idioma.
