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
name          text            -- ex: "Colorado Appia"
brand         text             -- ex: "Colorado"
attributes    jsonb            -- ex: {"estilo": "APA", "pais": "Brasil", "volume_ml": 355, "abv": 4.5}
image_url     text
canonical_slug text unique     -- pra URL amigável /produto/colorado-appia
created_at    timestamptz
updated_at    timestamptz
```

### `stores`
```sql
id            uuid pk
name          text
site_url      text
scraper_key   text nullable    -- identifica qual scraper/config usar, se aplicável
affiliate_program_id uuid nullable fk -> affiliate_programs
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
url            text            -- link original da página de venda
source_type   text             -- 'scrape' | 'email' | 'whatsapp_ocr' | 'manual'
source_ref    uuid nullable fk -> raw_captures
active        boolean default true
last_seen_at  timestamptz      -- última vez que essa oferta foi confirmada disponível
created_at    timestamptz
updated_at    timestamptz
unique (product_id, store_id)
```

### `price_history`
Série temporal de preços — a base pro cálculo de variação e alerta.
```sql
id            uuid pk
offer_id      uuid fk -> offers
price         numeric(10,2)
captured_at   timestamptz
```
Índice em `(offer_id, captured_at desc)`.

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

Os filtros do site (estilo, país, preço, loja) batem direto em:
- `products.attributes ->> 'estilo'`, `products.attributes ->> 'pais'` (índice GIN em `attributes`)
- `offers.price` (range)
- `offers.store_id`

## Sobre afiliados (preparado, não implementado)

A rota pública de clique é sempre `/go/[offer_id]`, nunca a URL da loja direto. Hoje ela só faz
`redirect(offers.url)`. Quando `stores.affiliate_program_id` apontar pra um programa ativo, essa
mesma rota passa a montar a URL usando `affiliate_programs.link_template`. Nenhuma página do site
precisa mudar.
