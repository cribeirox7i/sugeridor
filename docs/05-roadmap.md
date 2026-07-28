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
- Tela `/admin/alertas` (feed de disparos) — depois renomeada pra `/admin/config`.
- Selo público "-X%" na listagem/produto, independente de regra configurada.
- **Pendente**: envio de e-mail de verdade (`notify_channel = 'email'` já grava no schema, mas
  nada dispara ainda) — pausado, ver nota abaixo.

## Melhorias mobile + UX geral (não estava no roadmap original) ✅ concluída
Lote de 15 itens após teste em celular: card de oferta reestruturado, acordeon de filtros no
mobile, popup de produto, auto-extração de logo/descrição da loja, checklist de inclusão na
coleta, carrossel de lojas + "página da loja".

## Queda em produção + reforma grande (2026-07-26) ✅ concluída

Uma loja mal configurada (Shopify, sem filtrar por coleção) trouxe o catálogo inteiro de uma loja
de vinho/mercearia junto com cerveja, inflando as ofertas ativas de ~200 pra 1446 — uma query da
home sem paginação em lotes estourou o limite de URL do Node e derrubou o site inteiro. A partir
daí, uma leva grande de correções e refinamentos:

- **Causa raiz**: Shopify passou a respeitar a collection cadastrada; queries da home viraram
  lotes de 100 ids; filtro de país/loja/estilo passou a vir só de ofertas ativas (não de
  `products` inteiro); `/go/[offerId]` parou de dar 404 (middleware do next-intl não excluía essa
  rota); scraper ganhou rate limit por host (era global) e passou a rodar lojas em paralelo.
- **Categorização de produtos** (`products.category`): cervejas/kit/copo/souvenirs/eventos,
  classificados por palavra-chave no nome — só `cervejas`+`kit` aparecem no site público.
- **Tipo de loja e país**: `store_type` (marketplace/própria) e `country` por loja — produtos de
  loja própria sem marca/país herdam da loja.
- **Site**: home consolidada numa única busca de ofertas (era ~7 queries por request, inclusive
  no popup de produto — por isso ele demorava mais que a home sozinha), navbar e barra de filtros
  fixos (só o conteúdo rola), busca por texto e ordenação (preço/nome/país), popover "outras
  lojas" via portal (não ficava mais cortado pelo card), idioma preservando a página atual.
- **Admin**: aba Alertas virou Config (com parâmetro de expiração de ofertas), Ofertas ganhou
  data de captura + filtro por loja/data + seleção em lote, Coleta ganhou busca por loja, layout
  mais largo com fonte menor nas grids.
- **Scraper — robustez**: preço `<= 0` nunca é gravado (aplicação **e** constraint no banco); um
  erro no meio de uma página/etapa não descarta o que já foi coletado com sucesso antes dela;
  imagem em formato inesperado não derruba o coletor; guard-rail de 200 produtos por loja por
  execução (override por `config.max_items`), contra qualquer paginação que não termine.
- Migrations `0007` a `0010`.

## Identidade de produto, escala e ferramentas de curadoria (2026-07-27) ✅ concluída

Leva grande em cima do que a reforma de 26/07 deixou de pé. O fio condutor foi **o que identifica um
produto** e **o que impede o catálogo de crescer**.

- **O nome do produto é MARCA + DESCRITIVO** (regra esclarecida pelo usuário): "IPA" não identifica
  nada, o produto é "Dogma IPA" — como "Fanta Laranja" não é só "Laranja". Em loja própria o scraper
  prefixa a marca no nome quando ela falta. Só em loja própria: no marketplace a marca vem do vendor
  e traz razão social, distribuidor ou placeholder. `stores.brand_alias` (apelido) resolve o nome
  longo — a loja segue "Cervejaria Dogma", o produto fica "Dogma IPA".
- **Nomes em Title Case** (a CAIXA ALTA anterior "ficou feia"), com artigos minúsculos e siglas de
  estilo (IPA/NEIPA/APA) sempre maiúsculas.
- **Regra nova de slug**: quando o nome já contém a marca, o slug deriva só do nome. A marca continua
  na identidade de propósito — sem ela o "IPA" da Dogma colidiria com o de outra cervejaria e
  ofertas de produtos *diferentes* seriam agregadas.
- **Diagnóstico do "bug de agregação"**: só 1 de 623 produtos tinha oferta em 2+ lojas, mas eram
  apenas **4 duplicatas reais** (nome igual, marca escrita diferente). O número baixo é sobretudo
  porque as 8 lojas têm catálogos quase disjuntos — 3 são cervejarias próprias com produtos
  exclusivos. Agregação em volume depende de haver marketplaces sobrepostos.
- **Escala do scraper**: gravação em lote (eram 3 idas ao banco por produto), leituras paginadas
  (o PostgREST corta em 1000 linhas sem avisar) e **sharding em 4 execuções paralelas** — o gargalo
  é o coletor jsonld, que abre uma página por produto; a 100 lojas isso passaria de 5h num job só.
  Enriquecimento virou job separado que roda uma vez, depois de todos os shards.
- **Custo de dados**: `price_history` passa a receber ponto **só quando o preço muda**, e a queda foi
  materializada em `offers.drop_percent` por trigger — a home parou de carregar o histórico de todas
  as ofertas em cada render. Projeção que motivou: 150 lojas a 1 coleta/dia dariam ~4,9M linhas/ano.
- **Expiração por loja** (`stores.offer_expiration_days`, null = global).
- **Admin reorganizado**: a tela Coleta foi absorvida por **Lojas** (com seleção em lote: excluir,
  incluir/tirar da coleta, **coletar selecionadas** — que exigiu o workflow aceitar `store_ids`);
  **Logomarca** virou seção de **Config**; e nasceu **Ferramentas**, reunindo as ações de curadoria:
  normalizar nomes, reclassificar categorias, regravar marca e nome das lojas próprias,
  ressincronizar identificadores, e as regras **de/para** (`text_replacements`) com resolução de
  duplicados por mesclagem manual.
- **Coletor Tray corrigido**: trazia 30 de 988 produtos (não paginava), sem imagem (procurava
  `featured_image`, que não existe nessa API) e com **todos os links apontando para a home da loja**
  (o campo `url` vem como objeto, não string). Agora também grava marca e respeita preço promocional.
- Migrations `0011` a `0015`; actions do workflow atualizadas para as que rodam em Node 24.

### Aprendizados que valem para o futuro deste projeto

- **Mudar a fórmula do slug dessincroniza o catálogo inteiro**: ao introduzir a regra nova, 717 de
  1109 slugs gravados ficaram fora dela — e é pelo slug que o scraper reconhece produto existente,
  então a coleta seguinte criaria uma duplicata de cada um. Qualquer mudança nessa fórmula exige
  atualizar **todos** os lugares que a calculam (`scraper/normalize.py`, `web/src/lib/slug.ts`,
  `replacements.ts`, `produtos/actions.ts`) e rodar a ressincronização.
- **Upsert do PostgREST exige linha completa**: é `INSERT ... ON CONFLICT`, então patch parcial
  (`{id, name}`) viola os NOT NULL. Aconteceu duas vezes — no scraper e depois no admin.
- **Ação de escrita que não checa erro mente para o usuário**: três ações do admin contavam o que
  *pretendiam* mudar e exibiam banner verde sem ter gravado nada (739 nomes "normalizados"
  continuavam em CAIXA ALTA).
- **Deploy antes da migration derruba o site**: código que lê coluna nova precisa tolerar o intervalo
  até a migration manual rodar.
- **"Re-run jobs" do GitHub Actions reusa o commit antigo** — nunca serve para testar um fix.

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
- Ainda não iniciada. Hoje existe **um** `product_type` ("Cerveja") para todos os produtos, então a
  coluna Tipo no admin não distingue nada — decisão consciente de manter, porque é ela que sustenta a
  engine genérica; `category` é outro eixo (o que é bebida vs. brinde/copo/ingresso).

## Pendências operacionais conhecidas
- **Botão "Rodar coleta" do admin ainda não funciona**: faltam `GITHUB_PAT`/`GITHUB_OWNER`/
  `GITHUB_REPO` no ambiente do Vercel. As coletas são disparadas pela aba Actions ("Run workflow",
  nunca "Re-run jobs").
- **Agendamento** (`schedule:`) segue não configurado por decisão do usuário — a intenção é rodar
  1x/dia manualmente.
- **Central da Cerveja** responde 403 ao scraper: é o Cloudflare barrando o IP do runner (do IP local
  o mesmo User-Agent recebe 200), então não é questão de header. Ou se aceita que ela falhe, ou se
  desmarca da coleta.
- **Sharding com 4 shards** dá conta de ~50 lojas; a 100+ subir a lista `shard:` e
  `SCRAPER_SHARD_TOTAL` juntos (10 ou 12).

## Fora do escopo por enquanto (mencionar mas não construir)
- Integração de fato com programas de afiliados (estrutura já existe, ativar quando entrar em
  algum programa).
- App mobile / push notification nativo.
