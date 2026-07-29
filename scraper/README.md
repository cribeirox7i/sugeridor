# Scraper

Coletor de ofertas em Python, rodado pelo GitHub Actions (disparo manual via
`workflow_dispatch`, acionado pelo botão "Coleta" no admin). Ver
[docs/04-conectores-ingestao.md](../docs/04-conectores-ingestao.md).

## Arquitetura: coletores por PLATAFORMA, config por loja

Em vez de um módulo de código por loja, o scraper tem um coletor genérico por
**plataforma de e-commerce** (`scraper/platforms/`), e cada loja no banco
guarda um `config` (JSONB) com os detalhes específicos daquele site. Adicionar
uma loja nova de plataforma já suportada é só cadastro no admin — não precisa
de código. Só uma plataforma realmente nova exige um módulo novo.

Plataformas suportadas:

| `platform` | Estratégia |
|---|---|
| `vtex` | API pública de busca do catálogo (`_from`/`_to`) |
| `shopify` | Endpoint `/products.json` |
| `tray` | Cascata: API `/web_api/products` → JSON embutido → fallback HTML |
| `jsonld` | Lê `<script type="application/ld+json">` (schema.org/Product) na página de produto |
| `html` | Seletores CSS configuráveis, por container de produto |
| `txt` | Busca posicional (`find`) configurável — último recurso pra sites sem estrutura. **Não se escreve o config à mão**: o formulário de loja tem detecção automática por produto de exemplo e preenchimento manual das tags, os dois com teste contra a página real. Ver [docs/04-conectores-ingestao.md](../docs/04-conectores-ingestao.md) |

O formato de `config` de cada plataforma está documentado no docstring do
módulo correspondente (`scraper/platforms/<nome>.py`) e replicado como dica no
admin (`web/src/lib/platforms.ts` — manter as duas em sincronia).

## Disponibilidade: produto esgotado sai das ofertas

Cada coletor preenche `Candidate.available`, que o `pipeline.py` mapeia direto
para `offers.active` — então um produto marcado como esgotado na loja sai do site
**na mesma coleta**, sem esperar os 45 dias da expiração por `last_seen_at`.

`extract.py::parse_available` normaliza os formatos incompatíveis entre
plataformas (tabela por plataforma em
[docs/04-conectores-ingestao.md](../docs/04-conectores-ingestao.md)). O caso que
justifica a função existir: **o Tray devolve `available` como a STRING `"0"`**, e
`"0"` é *truthy* em Python — testar com `bool()` marcaria como disponível
justamente o que está esgotado. Sem sinal reconhecível a função assume
disponível, para não esconder catálogo por um campo que a loja não publica.

Oferta indisponível também **não gera ponto em `price_history`**: o esgotado
segue com preço na vitrine, e esse ponto sujaria a média que alimenta o selo
"-X%".

## Como funciona

1. `run.py` lê do Supabase as lojas que têm `platform` definido, e coleta
   todas **em paralelo** (threads, uma por loja — são hosts diferentes, então
   rodar em série significa que o tempo total é a soma de cada loja, inviável
   com 100+ lojas cadastradas). Se `SCRAPER_STORE_IDS` estiver preenchido (é o
   que o botão "Coletar selecionadas" do admin manda), só essas lojas entram —
   filtro aplicado ANTES do sharding. Se `SCRAPER_SHARD_TOTAL > 1`, cada
   execução pega só a fatia que corresponde ao seu `SCRAPER_SHARD_INDEX` — ver
   "Escala" abaixo.
2. Para cada loja, chama o coletor da plataforma, passando `site_url` e `config`.
3. Cada coletor devolve uma lista de `Candidate` (nome, marca, preço, etc.).
   Candidatos com preço `<= 0` são descartados no `pipeline.py` (não geram
   produto, oferta nem histórico).
4. `pipeline.py` resolve a **identidade** do candidato e grava, tudo em LOTE
   (era 1 select + 1 upsert + 1 insert por produto, o que a 100 lojas × 200
   itens dá ~60 mil requests e estoura o tempo de job só de latência):
   - **Loja `propria`**: `brand` = apelido da loja (`stores.brand_alias`, ou o
     nome dela) e o **nome ganha a marca na frente** quando não a tem ("IPA" →
     "Dogma IPA") — o nome de um produto é marca + descritivo. No marketplace
     isso NÃO se aplica: lá a marca vem do vendor e traz razão social,
     distribuidor ou placeholder.
   - Só então o slug é calculado (`product_slug`): se o nome já contém a marca,
     deriva só do nome; senão, marca + nome. A ordem importa — o slug deriva de
     marca+nome, então resolver a identidade depois deixaria a chave errada.
   - O nome também passa por `clean_product_name`, que separa a **medida** do
     número ("Urweisse500ml" → "Urweisse 500 ml", unidade em forma canônica) —
     são dois cortes, palavra↔número e número↔unidade. Sem o primeiro,
     "IPA355ml" é uma palavra só e o Title Case a estragava ("Ipa355ml").
     Espelhado em `web/src/lib/text.ts::separateUnits`.
   - `category` (cervejas/kit/copo/souvenirs/eventos) é classificada por
     palavra-chave só na criação (`categorize.py`, palavras vindas da tabela
     `category_keywords`), usando o nome ORIGINAL da fonte — o prefixo de marca
     poderia introduzir uma palavra-chave por acidente.
   - Upsert da oferta (uma por produto+loja) e ponto em `price_history`
     **apenas se o preço mudou** (ou é a primeira vez que a oferta é vista).
     `last_seen_at` é atualizado sempre, então a expiração não é afetada.

   Dois cuidados registrados no código: o Postgres recusa o lote inteiro se a
   mesma chave de conflito aparecer duas vezes (daí o dedup antes de enviar), e
   o `upsert` do PostgREST exige linha COMPLETA — patch parcial vai por PATCH
   (`db.update_by_id_many`), senão os NOT NULL são violados.
5. Cada execução é registrada em `ingestion_jobs` (visível no admin).
6. Depois que **todas** as lojas terminam, `enrich.py` roda passos sobre o
   catálogo inteiro (não faz sentido por-loja): desativa ofertas não vistas há
   mais de `stores.offer_expiration_days` (ou o global de `site_settings`, se a
   loja não tiver prazo próprio); pra lojas `store_type = 'propria'`, preenche
   marca/país ausente com o **apelido** (`brand_alias`, ou o nome) e o país da
   própria loja; preenche país ausente pela marca mais comum entre produtos da
   mesma marca. Sempre só completa o que falta, nunca sobrescreve dado já
   gravado — a versão que SOBRESCREVE está no admin, no botão "Regravar
   países" de Ferramentas.

   Usar o apelido aqui não é detalhe: usar `name` direto contradizia o
   `pipeline.py` (que usa `brand_alias or name`) a cada coleta numa loja com
   apelido, e `brand` **entra no slug** — a marca ficava oscilando entre as
   duas formas.

   Com sharding, isso NÃO roda nos shards: é um job separado
   (`--enrich-only`) que depende de todos eles, porque rodá-lo em N execuções
   seria N vezes o mesmo trabalho disputando as mesmas linhas.

Toda leitura passa por `db.select`, que **pagina de 1000 em 1000**: o PostgREST
corta a resposta nesse limite devolvendo 200 OK, sem erro — sem paginar, o
enriquecimento simplesmente ignorava os produtos além do milésimo.

O scraper escreve usando a **service_role key** do Supabase (ignora RLS). Essa
chave nunca vai pro frontend — só existe como secret do GitHub Actions.

## Teto de produtos por loja (guard-rail genérico)

Todo coletor para em `DEFAULT_MAX_ITEMS_PER_STORE` (padrão 200, ver
`scraper/config.py`) produtos coletados, não importa quantas páginas/blocos
faltariam — proteção contra paginação que não termina (config errada, CDN
devolvendo página repetida em vez de vazia, catálogo real gigante). Lojas
com catálogo real maior que isso precisam de `"max_items": <N>` na `config`
da loja (JSONB, editável no admin) pra não serem cortadas.

## Rate limit é por host, não global

`http.py` guarda o timestamp do último request **por domínio**. Isso é o que
permite paralelizar lojas com segurança: duas lojas em domínios diferentes não
esperam uma a outra, mas requests pro mesmo domínio continuam espaçados por
`SCRAPER_REQUEST_DELAY` segundos (rate limit educado, ver
[docs/06-riscos-e-legal.md](../docs/06-riscos-e-legal.md)) mesmo vindos de
threads diferentes.

## Rodar localmente

```bash
pip install -r scraper/requirements.txt
export SUPABASE_URL="https://<ref>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service_role key>"
python -m scraper.run
```

Variáveis opcionais: `SCRAPER_MAX_PAGES` (padrão 20), `SCRAPER_REQUEST_DELAY`
(segundos entre requests ao mesmo host, padrão 1.0), `SCRAPER_USER_AGENT`,
`SCRAPER_MAX_WORKERS` (lojas em paralelo, padrão 8),
`SCRAPER_MAX_ITEMS_PER_STORE` (padrão 200),
`SCRAPER_SHARD_INDEX`/`SCRAPER_SHARD_TOTAL` (ver abaixo).

## Escala: sharding entre execuções paralelas

O gargalo pra crescer não é o banco (as gravações são em lote) nem o
paralelismo entre lojas: é o coletor `jsonld`, que abre **uma página por
produto**. Com o rate limit educado de 1 req/s por site, uma loja de 200
produtos leva ~3min — e a 100 lojas isso passa de 5 horas num job só.

A saída é dividir as lojas entre execuções paralelas. Cada shard fica com uma
fatia (hash do id da loja, em `_belongs_to_shard`), o que divide o tempo **sem
ficar mais agressivo com nenhuma loja**: cada site continua recebendo 1 req/s,
só em runners diferentes.

```bash
# shard 0 de 4 (cada um roda em paralelo, num runner próprio)
SCRAPER_SHARD_INDEX=0 SCRAPER_SHARD_TOTAL=4 python -m scraper.run

# depois de TODOS os shards: passos sobre o catálogo inteiro
python -m scraper.run --enrich-only
```

O workflow `.github/workflows/scrape.yml` já faz isso: um job `collect` com
`strategy.matrix` de 4 shards e um job `enrich` que depende dele. Para ajustar
o número de shards, mude a lista `shard:` **e** `SCRAPER_SHARD_TOTAL` juntos
(se divergirem, parte das lojas fica sem shard e nunca é coletada). A conta é
`(lojas ÷ shards) × ~3min < 40min`: 4 shards dão conta de ~50 lojas; a 100
lojas, use 10 ou 12.

O enriquecimento (expiração, unificação de marca/país) **não** roda nos shards:
ele olha o catálogo inteiro, então rodá-lo em N shards seria N vezes o mesmo
trabalho em paralelo, disputando as mesmas linhas. Sem sharding
(`SCRAPER_SHARD_TOTAL=1`, o padrão), `run.py` continua fazendo tudo numa
execução só.

## Adicionar uma loja de plataforma já suportada

No admin, cadastre/edite a loja escolhendo a plataforma no dropdown "Coleta
automática" e preenchendo o `config` (o formulário mostra um exemplo e uma
dica por plataforma).

## Adicionar uma plataforma nova

1. Escreva `platforms/<minha_plataforma>.py` com uma função
   `collect(store: StoreRecord) -> list[Candidate]`.
2. Registre em `platforms/__init__.py` no `REGISTRY`.
3. Adicione a entrada correspondente em `web/src/lib/platforms.ts` (dropdown do
   admin).
