# Modelo de Dados

Schema pensado para ser **genérico por tipo de produto**: campos fixos e comuns a qualquer
produto ficam em colunas normais; campos específicos (estilo/país pra cerveja, safra/região pra
vinho, autor/editora pra livro) ficam em uma coluna `attributes JSONB`. Isso evita migração de
schema quando um novo tipo de produto entrar.

## Tabelas principais

### `product_types`
Cadastro dos tipos de produto suportados (extensível).
```sql
id            uuid pk
slug          text unique      -- 'cerveja', 'vinho', 'livro'
name          text
attribute_schema jsonb         -- descreve quais campos existem nesse tipo, pra validar o form do admin
created_at    timestamptz
```

### `products`
Catálogo canônico — um produto pode ter várias ofertas (em lojas diferentes).
```sql
id            uuid pk
product_type_id uuid fk -> product_types
name          text            -- ex: "Dogma IPA 473 ml" — o nome é MARCA + DESCRITIVO. "IPA" sozinho
                                -- não identifica produto, como "Fanta Laranja" não é só "Laranja".
                                -- Em loja 'propria' o scraper prefixa a marca quando ela não está no
                                -- nome. Gravado em Title Case (artigos minúsculos, siglas de estilo
                                -- como IPA/NEIPA em maiúscula) e com a MEDIDA separada do número
                                -- ("Urweisse500ml" → "Urweisse 500 ml"), unidade em forma canônica
                                -- (ml/cl/dl/kg/g/oz minúsculos, litro como 'L') — ver
                                -- scraper/normalize.py::separate_units, espelhado em
                                -- web/src/lib/text.ts, e o backfill da migration 0016.
brand         text             -- ex: "Dogma". Em loja 'propria' é sempre o apelido da loja (ou o
                                -- nome dela); em marketplace vem do vendor da fonte e é
                                -- inconsistente (razão social, distribuidor, placeholder).
attributes    jsonb            -- ex: {"estilo": "APA", "pais": "Brasil", "volume_ml": 355, "abv": 4.5}
image_url     text
canonical_slug text unique     -- identidade do produto E url amigável. Fórmula: se o nome já
                                -- contém a marca, é slugify(nome); senão slugify(marca + nome) —
                                -- ver product_slug/productSlug (espelhados em
                                -- scraper/normalize.py e web/src/lib/slug.ts). A marca faz parte
                                -- da chave de propósito: sem ela o "IPA" da Dogma colidiria com o
                                -- "IPA" de outra cervejaria e ofertas de produtos DIFERENTES
                                -- seriam agregadas. ATENÇÃO: mudar essa fórmula dessincroniza
                                -- todos os slugs gravados e a coleta seguinte cria duplicatas —
                                -- existe "Ressincronizar identificadores" em /admin/ferramentas.
category      text default 'cervejas'  -- 'cervejas'|'kit'|'copo'|'souvenirs'|'eventos'|'assinaturas'
                                        -- (texto livre, classificado por palavra-chave no scraper —
                                        -- ver 04-conectores-ingestao.md; 'assinaturas' é manual-only,
                                        -- o scraper nunca classifica um produto assim). Só
                                        -- 'cervejas'+'kit' aparecem no catálogo público.
hidden        boolean default false    -- migration 0020. Curadoria manual: oculta do catálogo
                                        -- público sem afetar a coleta — o scraper continua
                                        -- atualizando preço/histórico normalmente, só a leitura
                                        -- pública (web/src/lib/queries.ts::listOffers) exclui.
created_at    timestamptz
updated_at    timestamptz
```

### `stores`
```sql
id            uuid pk
name          text
site_url      text
platform      text nullable    -- 'vtex'|'shopify'|'tray'|'jsonld'|'html'|'txt' — plataforma do
                                -- coletor (null = só cadastro manual, sem coleta automática)
config        jsonb default '{}'  -- parâmetros específicos do coletor daquela plataforma (ver
                                   -- scraper/README.md)
logo_url      text nullable
description   text nullable
include_in_collection boolean default true  -- toggle rápido pra tirar a loja da coleta sem
                                             -- desconfigurar a plataforma
store_type    text default 'propria'      -- 'marketplace' (revende várias marcas) | 'propria'
                                           -- (a própria cervejaria, default desde a migration 0018 —
                                           -- a maioria das lojas cadastradas até aqui é própria) —
                                           -- produtos sem marca/país de loja 'propria' herdam o
                                           -- nome/país dela
country       text default 'Brasil'       -- país da loja, usado na herança acima
brand_alias   text nullable   -- forma curta do nome ("Dogma" para "Cervejaria Dogma"), usada como
                               -- products.brand e como prefixo do nome dos produtos em loja
                               -- 'propria'. null = usa `name` (migration 0015)
offer_expiration_days int nullable  -- prazo próprio de expiração desta loja; null = usa o global
                                     -- de site_settings (migration 0013)
affiliate_program_id uuid nullable fk -> affiliate_programs
active        boolean default true  -- migration 0020. Separado de `include_in_collection`: loja
                                     -- inativa some do site (home/carrossel/ /lojas) E sai da
                                     -- coleta (marcar inativa desliga include_in_collection também;
                                     -- o inverso não liga a coleta de volta sozinho ao reativar).
whatsapp_number text nullable        -- migration 0020. Loja "vendedor WhatsApp" — cadastro manual,
                                     -- sem site_url de verdade. Preenchido = `/go/[offerId]` manda
                                     -- pro wa.me da loja (com mensagem pronta) em vez de redirecionar
                                     -- pra `offers.url`. Só dígitos com DDI, ex: "5511999999999".
created_at    timestamptz
```

### `affiliate_programs` (vazio/inerte por enquanto, só a estrutura)
```sql
id            uuid pk
name          text
link_template text             -- ex: "https://loja.com/go?ref=SEU_ID&url={url}"
active        boolean default false
```

### `offers`
Estado atual de uma oferta (produto X em loja Y). Uma linha por combinação produto+loja ativa.
```sql
id            uuid pk
product_id    uuid fk -> products
store_id      uuid fk -> stores
price         numeric(10,2)
currency      text default 'BRL'
url            text nullable   -- link original da página de venda. null pra loja "vendedor
                                -- WhatsApp" (stores.whatsapp_number, migration 0020) — nesse caso
                                -- `/go/[offerId]` manda pro wa.me da loja em vez de redirecionar
                                -- pra um link de produto que não existe.
source_type   text             -- 'scrape' | 'email' | 'whatsapp_ocr' | 'manual'
source_ref    uuid nullable fk -> raw_captures
active        boolean default true  -- false em TRÊS casos (ver 04-conectores-ingestao.md):
                                     -- (a) o coletor viu o produto marcado como ESGOTADO na
                                     --     listagem (`Candidate.available`);
                                     -- (b) o produto DESAPARECEU da listagem da loja e a listagem
                                     --     coletada era completa — o caminho mais comum numa loja
                                     --     Shopify, e o que a expiração levava 45 dias pra pegar;
                                     -- (c) last_seen_at passou de stores.offer_expiration_days (ou
                                     --     o global de site_settings) — rede de segurança pra loja
                                     --     que parou de ser coletada.
                                     -- Desativar é REVERSÍVEL: a coleta seguinte que enxergar o
                                     -- produto grava true de novo no upsert.
last_seen_at  timestamptz      -- última vez que essa oferta foi confirmada disponível. Atualizado
                                 -- a CADA coleta (é o que a expiração usa), mesmo quando o preço
                                 -- não muda e nenhum price_history é gravado
reference_price numeric(10,2) nullable -- média do histórico anterior ao ponto mais recente
drop_percent    numeric(5,2) nullable  -- queda % frente a essa referência; null = sem queda ou sem
                                        -- histórico suficiente. Mantidos por TRIGGER em
                                        -- price_history (migration 0013). A home lê estas colunas
                                        -- em vez de carregar o histórico de todas as ofertas a cada
                                        -- render — com 13 mil ofertas aquilo seriam dezenas de MB
                                        -- por visita
created_at    timestamptz
updated_at    timestamptz
unique (product_id, store_id)
check (price > 0)  -- preço <= 0 nunca é uma oferta válida — o scraper já descarta antes de
                    -- gravar, mas o constraint garante isso na origem pra qualquer caminho de
                    -- código (migration 0010)
```

### `price_history`
Série temporal de preços — a base pro cálculo de variação e alerta.
```sql
id            uuid pk
offer_id      uuid fk -> offers
price         numeric(10,2)
captured_at   timestamptz
check (price > 0)  -- mesmo motivo do constraint em offers (migration 0010)
```
Índice em `(offer_id, captured_at desc)`.

**Um ponto é gravado só quando o preço MUDA** (ou na primeira vez que a oferta é vista) **e só para
oferta disponível** — produto esgotado costuma seguir com o preço na vitrine, e gravar esse ponto
sujaria a média que alimenta o selo "-X%". Gravar a
cada coleta fazia a tabela crescer por tempo em vez de por informação — a projeção com 150 lojas a
1 coleta/dia dava ~4,9 milhões de linhas/ano, quase tudo repetido — e a repetição ainda distorcia a
leitura: a média do histórico anterior (base do selo "-X%") ficava diluída por dezenas de pontos
iguais e uma queda real aparecia menor do que é. Consequência visível: o gráfico tem degraus em vez
de um ponto por dia, o que representa melhor a realidade (o preço é constante entre mudanças).

### `price_alerts`
Regras de alerta, parametrizáveis.
```sql
id                uuid pk
scope             text          -- 'product' | 'product_type' | 'global'
scope_id          uuid nullable -- product_id ou product_type_id, conforme o scope
threshold_percent numeric(5,2)  -- ex: 30.00 = alertar se caiu 30% ou mais
notify_channel    text          -- 'email' | 'push' (futuro)
active            boolean default true
created_at        timestamptz
```

### `alert_triggers`
Log de quando um alerta disparou (pra não notificar duplicado e pra exibir "ofertas em queda" no site).
```sql
id            uuid pk
alert_id      uuid fk -> price_alerts
offer_id      uuid fk -> offers
price_at_trigger numeric(10,2)
reference_price  numeric(10,2)  -- preço médio/mínimo de referência usado no cálculo
drop_percent     numeric(5,2)
triggered_at     timestamptz
```

### `raw_captures`
Guarda o dado bruto antes da normalização por IA — essencial pra debugar quando o normalizador
erra (scraper mudou, OCR leu errado, etc.) e pra reprocessar sem precisar capturar de novo.
```sql
id            uuid pk
source_type   text           -- 'scrape' | 'email' | 'whatsapp_ocr' | 'manual'
raw_payload   jsonb          -- HTML bruto, corpo do e-mail, ou referência à imagem
image_path    text nullable  -- path no Supabase Storage, se for print do WhatsApp
processed     boolean default false
processing_error text nullable
created_at    timestamptz
```

### `ingestion_jobs`
Log de execução dos crons (scraping e e-mail), pra monitorar saúde do pipeline.
```sql
id            uuid pk
job_type      text           -- 'scrape' | 'email_sync'
store_id      uuid nullable
status        text           -- 'success' | 'partial' | 'failed'
items_found   int
items_new     int
error_message text nullable
started_at    timestamptz
finished_at   timestamptz
```

### `category_keywords`
Palavras que classificam `products.category` pelo nome, editáveis em `/admin/classificacao`
(migrations 0011/0012). Antes eram lista hardcoded no scraper, o que exigia mudar código a cada
palavra nova.
```sql
id            uuid pk
category      text           -- 'eventos'|'kit'|'copo'|'souvenirs' ('cervejas' é o fallback, sem linha)
keyword       text
created_at    timestamptz
unique (category, keyword)
```
A **ordem de prioridade** entre categorias NÃO é dado: fica fixa no código
(`scraper/categorize.py::_CATEGORY_ORDER`), porque "Kit Copo + Cerveja" precisa virar 'kit' e não
'copo'. O scraper carrega a tabela uma vez por execução e cacheia em memória.

### `text_replacements`
Regras de/para aplicadas **sob demanda** (nunca na coleta) sobre o NOME do produto, em
`/admin/ferramentas` (migration 0014).
```sql
id            uuid pk
target        text           -- 'name' | 'brand' — 'brand' só em regra ANTIGA (ver abaixo)
search        text           -- o espaço importa nas duas pontas: "Alemã " (com espaço) não casa
                              -- "Alemãzinha"; " 500ml" no `replace` separa volume emendado
replace       text default ''  -- vazio = remove o trecho
active        boolean default true
created_at    timestamptz
unique (target, search)
```
Existe porque o coletor grava o que a loja escreve: remover o prefixo "Cerveja" deixa "Alemã
Paulaner…" (58 produtos). Aplicar recalcula o slug; onde dois produtos convergem, o conflito é
**listado** para o usuário mesclar caso a caso, nunca mesclado sozinho.

**`target = 'brand'` está pausado desde a migration 0021** (item 1 da leva de melhorias,
2026-07-30): o catálogo de marcas (`brands`/`brand_aliases`, abaixo) passou a ser a autoridade
sobre `products.brand` — era o de/para quem resolvia "PAULANER BRAUEREI GRUPPE GMBH & CO. KGAA" vs
"Paulaner", agora é uma marca cadastrada com esse alias. O formulário de regra nova em
`/admin/ferramentas` não oferece mais `target = 'brand'`; regras antigas desse tipo continuam
funcionando (nada foi apagado) até serem migradas manualmente pra `/admin/marcas`.

### `brands` / `brand_aliases`
Catálogo normalizado de marcas — nome canônico + país + variações encontradas nas lojas, editável
em `/admin/marcas` (migration 0021). Substitui `text_replacements` como autoridade sobre
`products.brand` e complementa (não substitui) a regra B de país de `planCountryRewrite`
("completar pela marca mais comum" — fill-only, só age quando a marca ainda não está cadastrada
aqui).
```sql
-- brands
id            uuid pk
name          text unique     -- forma canônica, ex: "Paulaner"
country       text nullable   -- país de origem — null = desconhecido
created_at    timestamptz

-- brand_aliases
id            uuid pk
brand_id      uuid fk -> brands on delete cascade
alias         text unique     -- variação encontrada numa loja, ex:
                               -- "PAULANER BRAUEREI GRUPPE GMBH & CO. KGAA"
created_at    timestamptz
```
`alias` é `unique` global (não só por marca): duas marcas nunca podem reivindicar a mesma variação
— evita cadastrar a mesma string sob duas marcas por engano. O nome canônico da marca também conta
como "alias de si mesmo" na busca (fold — minúsculas, sem acento/pontuação), então não é preciso
cadastrar um alias idêntico ao nome.

**Onde a busca acontece**: no scraper (`scraper/brands.py::lookup_brand`, só pra loja NÃO própria —
loja própria já tem marca/país por autoridade dela mesma, ver `pipeline.py::_resolve_identity`) e
no cadastro manual de produto (`produtos/actions.ts`). As duas fazem o MESMO fold+match — é um
SELECT, não uma regra de negócio como a fórmula do slug, então o risco de dessincronizar entre
Python e TS é bem menor que os casos já vividos aqui (fórmula do slug, separação de medida).

**"Aplicar catálogo de marcas aos produtos existentes"** (`/admin/marcas`) resolve o mesmo furo que
"Reclassificar existentes" resolveu pra `category_keywords`: sem isso, cadastrar uma marca nova só
afetaria produto futuro. A ação recalcula marca+país dos produtos que batem com algum alias e
**ressincroniza os slugs automaticamente em seguida** — renomear marca muda o slug, e esquecer o
resync é o mesmo bug já documentado (coleta seguinte duplicaria cada produto renomeado).

### `ignored_duplicates`
Pares de produtos que o admin marcou como **"não são duplicata"**, em `/admin/ferramentas`
(migration 0017).
```sql
id            uuid pk
product_a_id  uuid fk -> products on delete cascade
product_b_id  uuid fk -> products on delete cascade
created_at    timestamptz
check (product_a_id < product_b_id)  -- par CANÔNICO
unique (product_a_id, product_b_id)
```
Existe porque a tela detecta duplicatas (mesmo nome com identificador diferente, ou nomes que
colidiriam depois das regras de/para) e antes a única saída era **mesclar** — a decisão de ignorar
vivia só no estado da tela e os 27 grupos reapareciam a cada recarregamento.

Três detalhes que importam:
- **O `check (a < b)` mais a ordenação dos ids no código** é o que faz o `unique` realmente
  deduplicar. Sem isso o mesmo par entraria duas vezes, invertido.
- **`on delete cascade`**: se um dos produtos for apagado depois (mesclado por outro caminho), a
  linha de ignorados desaparece sozinha.
- **Um grupo só sai da tela quando TODOS os seus pares estão ignorados**
  (`web/src/lib/duplicates.ts::isGroupIgnored`). Num grupo de 3+, ignorar A-B não pode esconder a
  duplicata A-C.

Ignorar também é mais barato que mesclar em escrita: mesclar move ofertas, apaga produto e mexe em
várias linhas; ignorar grava uma. Os dois produtos seguem separados e o coletor continua gravando
ponto de histórico apenas quando o preço muda — nenhuma escrita a mais por causa disso.

### `site_settings`
Linha única (singleton, `id = 1`) com configurações globais do site.
```sql
id                     int pk (sempre 1)
logo_black_url         text nullable  -- logo pro tema claro (editável em /admin/config)
logo_white_url         text nullable  -- logo pro tema escuro
offer_expiration_days  int default 45  -- editável em /admin/config — dias sem o scraper ver a
                                        -- oferta até desativá-la automaticamente
auto_apply_replacements boolean default false  -- migration 0018. Liga a automação pós-coleta que
                                        -- aplica as regras de/para ativas sozinha, uma por vez, na
                                        -- mesma ordem e com a mesma regra de segurança do botão
                                        -- manual (nunca grava o que colidiria com outro produto) —
                                        -- ver web/src/lib/postCollect.ts e 04-conectores-ingestao.md
auto_merge_duplicates  boolean default false  -- migration 0018. Liga a mesclagem automática das
                                        -- duplicatas (por nome e as que as regras de/para criariam),
                                        -- pulando pares marcados como "ignorar", seguida de
                                        -- ressincronização de slug (essencial pós-mesclagem)
updated_at             timestamptz
```

## Cálculo de variação de preço (resumo da lógica)

1. Preço de referência de um `offer` = média (ou mínimo) dos últimos N dias de `price_history`
   (ex: 90 dias), excluindo o próprio preço mais recente.
2. Quando um novo preço chega, calcular `drop_percent = (referência - novo_preço) / referência * 100`.
3. Se `drop_percent >= threshold_percent` de algum `price_alert` aplicável (pelo escopo:
   produto específico, tipo de produto, ou global), criar um `alert_trigger` e disparar a
   notificação configurada.
4. Ofertas com `alert_trigger` recente também podem ganhar um badge "preço baixo" na listagem,
   independente de o usuário ter configurado notificação.

## Índices e filtros do catálogo

O catálogo público busca **todas** as ofertas ativas de categoria `cervejas`/`kit` numa query só
(sem filtro de usuário) e aplica estilo/país/loja/preço/busca/ordenação **em memória** no Next.js
(`web/src/lib/queries.ts`), não em queries separadas por combinação de filtro — o volume atual (
algumas centenas de ofertas) torna isso mais barato do que uma ida ao banco por filtro. Os únicos
índices relevantes hoje:
- `products.category` (usado no `.in()` que já separa cervejas/kit do resto)
- `offers.active`

Se o catálogo crescer muito (milhares de ofertas), vale reavaliar e voltar a filtrar no banco
(`products.attributes ->> 'estilo'`/`'pais'` com índice GIN, `offers.price`/`store_id`).

## Sobre afiliados (preparado, não implementado)

A rota pública de clique é sempre `/go/[offer_id]`, nunca a URL da loja direto. Hoje ela só faz
`redirect(offers.url)`. Quando `stores.affiliate_program_id` apontar pra um programa ativo, essa
mesma rota passa a montar a URL usando `affiliate_programs.link_template`. Nenhuma página do site
precisa mudar.
