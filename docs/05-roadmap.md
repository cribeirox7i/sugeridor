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

## Curadoria em lote, medida no nome e disponibilidade (2026-07-28/29) ✅ concluída

Quatro levas seguidas, todas motivadas por uso real do admin e do site no celular.

- **Medida separada do número no nome** (migration `0016` + normalizador espelhado): eram 901 de
  1497 produtos com a unidade colada ("Erdinger Urweisse500ml"). São **dois cortes** —
  palavra↔número e número↔unidade — e o segundo só apareceu ao testar: sem separar a palavra,
  "IPA355ml" é uma palavra só e o Title Case a estragava ("Ipa355ml"). Uma migration sozinha não
  bastaria: o slug deriva do nome, então sem o normalizador a coleta seguinte não reconheceria 901
  produtos e duplicaria todos.
- **Mesclar duplicatas em lote**: eram 219 pares para confirmar um a um. A ação passou a receber
  **grupos** de ids, não pares — um produto pode estar duplicado 3+ vezes, e resolver por pares
  independentes falha no segundo (que aponta para um produto que o primeiro já apagou).
- **Ignorar duplicata** (migration `0017`, `ignored_duplicates`): nem toda coincidência é duplicata,
  e antes a decisão de ignorar vivia só no estado da tela. Ver 03-modelo-dados.md para as três
  regras que importam (par canônico, cascade, e "grupo só sai quando todos os pares estão
  ignorados").
- **Aplicar de/para POR REGRA**, não em bloco. O botão único parecia quebrado e não estava: com as
  quatro regras ativas do usuário, o plano combinado dava **0 aplicáveis e 260 colisões** — todo
  nome que mudaria virava duplicata de outro, então não havia nada seguro a gravar. Isoladas, as
  mesmas regras aplicam (separar volume rendia 56 produtos). A tela passou a mostrar "N aplicáveis
  agora, M são duplicatas", que era a distinção que faltava.
- **Botão "Regravar países"** com as duas regras que só existiam na coleta: loja própria
  **sobrescreve** o país dos produtos dela (é o caso "mudou de marketplace para própria"), e produto
  sem país recebe o mais comum da mesma marca (fill-only). É a única ação de curadoria da tela sem
  risco de dessincronizar o catálogo — país não entra na fórmula do slug.
- **Produtos sem marca/imagem no site: quarta ocorrência da mesma classe de bug.** Quando o coletor
  Tray passou a gravar `brand`, a marca entrou no slug (ela entra quando o nome não a contém) e 14
  produtos ficaram órfãos, com oferta **ativa da mesma loja** nos dois registros — o unique é
  `(product_id, store_id)`, nada no banco impede. O órfão ficava com preço congelado (R$ 29,95 vs
  R$ 25 real). Lição a somar à regra do slug: **não é só mudar a FÓRMULA que dessincroniza — passar
  a POPULAR um campo que entra nela tem o mesmo efeito.**
- **Reorganização da home** conforme esboço do usuário: barra de ferramentas única (busca + país +
  "mais filtros e ordenação" + carrossel de lojas + "Todas as lojas"), área útil de 976px com 5
  cards por linha, página da loja usando a mesma barra, e a página pública nova **`/lojas`**. Ver
  02-arquitetura.md, inclusive as duas armadilhas de layout que essa barra produziu.
- **Coletor TXT deixou de exigir JSON à mão**: detecção automática por produto de exemplo (ou pelo
  último produto já coletado da loja) **e** preenchimento manual das tags, os dois com teste contra
  a página real. Ver 04-conectores-ingestao.md, em especial as duas armadilhas do parser (ordem dos
  campos e tag no meio do início).
- **Produto esgotado sai das ofertas na mesma coleta** — `Candidate.available` já existia e o
  pipeline já o mapeava para `offers.active`; os coletores é que nunca preenchiam.
- Ajustes de admin: modal só fecha no ✕, botão de limpar nos campos de texto, e o modo Cartões
  sobrevive ao "Incluir".
- Migrations `0016` e `0017`.

### Aprendizados desta leva

- **O teste automatizado pagou por si três vezes**, sempre pegando bug ANTES de ir para produção:
  "Indisponível" caindo no default por causa do acento; `"10"` casando com `"0"` numa comparação por
  sufixo e virando esgotado; e a armadilha da tag no meio do início, no modo manual do TXT.
- **Campo booleano de API pode ser a string `"0"`**, que é *truthy* em Python. O Tray faz isso — e é
  a mesma família do bug de link/imagem virem como objeto naquela API.
- **`setState` não serve para alterar o que um `<form>` nativo vai enviar**: o submit serializa o
  DOM antes do React re-renderizar. Precisa de `ref`.
- **Campo de filtro que existe no modo A e não no modo B tem que ir por campo escondido.** Ao fazer
  a página da loja usar a mesma barra, o `hideStore` removeu o select de loja — e qualquer
  submissão (buscar, filtrar, ordenar) passou a perder o `?loja=` e jogar o usuário no catálogo
  geral.
- **Layout validado com o volume de hoje quebra com o de amanhã**: a barra foi conferida com 7 lojas
  e quebrou em 9. Testar acima do volume atual, não com o que está no banco.
- **Feature funcionando pode acordar bug adormecido.** A separação de medida no nome fez os slugs de
  lojas diferentes convergirem — que é o objetivo, é o que faz as ofertas agregarem numa página só
  (a agregação saiu de 1 para 21 produtos com 2+ lojas). Só que o fluxo "consulta quais slugs
  existem → insere os que faltam" tem uma janela de corrida, e com as lojas rodando em paralelo isso
  passou a estourar 409 no unique de `canonical_slug`. A garantia tinha que vir do banco
  (`ON CONFLICT DO NOTHING`) — um lock em Python não cobre shards, que são processos separados.
- **Rotação de chave do Supabase pode falhar de forma intermitente.** Um shard deu 401 e três
  passaram, com a mesma chave. Isso me levou a descartar a hipótese de credencial — errado: o
  projeto tinha migrado para o formato novo de chaves (`sb_publishable_`/`sb_secret_`) e a
  propagação da chave legada sendo desativada é inconsistente. Atualizar o secret resolveu. Lição:
  falha de auth intermitente **não** descarta credencial; num sistema distribuído a ausência de
  determinismo é esperada.

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
- **País está ausente em ~700 de 1319 produtos**, e a regra "completar pela marca" não tem efeito
  hoje: das 108 marcas envolvidas, nenhuma tem um único produto irmão com país preenchido, então não
  há de onde inferir. Não é bug — é fill-only por desenho. Ganha utilidade quando o coletor ou
  curadoria manual preencher país em pelo menos 1 produto por marca. É também o que hoje deixa o
  filtro de país mais pobre do que poderia.
- **O coletor `txt` nunca rodou contra uma loja real** — foi validado com fixtures sintéticas e com
  paridade TS↔Python. Ao configurar a primeira loja própria com ele, conferir a pré-visualização com
  atenção antes de salvar e rodar uma coleta de teste depois.
- **Detecção de esgotado não cobre `html` e `txt`** (não há sinal estruturado nessas plataformas).
  Nelas, produto esgotado só sai por expiração de `last_seen_at`.
- **`npm run lint` acusa 1 erro pré-existente** em `web/src/components/ThemeToggle.tsx`
  (`react-hooks/set-state-in-effect`), não relacionado às levas recentes.

## Fora do escopo por enquanto (mencionar mas não construir)
- Integração de fato com programas de afiliados (estrutura já existe, ativar quando entrar em
  algum programa).
- App mobile / push notification nativo.
