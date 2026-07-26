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
| `txt` | Busca posicional (`find`) configurável — último recurso pra sites sem estrutura |

O formato de `config` de cada plataforma está documentado no docstring do
módulo correspondente (`scraper/platforms/<nome>.py`) e replicado como dica no
admin (`web/src/lib/platforms.ts` — manter as duas em sincronia).

## Como funciona

1. `run.py` lê do Supabase as lojas que têm `platform` definido, e coleta
   todas **em paralelo** (threads, uma por loja — são hosts diferentes, então
   rodar em série significa que o tempo total é a soma de cada loja, inviável
   com 100+ lojas cadastradas).
2. Para cada loja, chama o coletor da plataforma, passando `site_url` e `config`.
3. Cada coletor devolve uma lista de `Candidate` (nome, marca, preço, etc.).
   Candidatos com preço `<= 0` são descartados no `pipeline.py` (não geram
   produto, oferta nem histórico).
4. `pipeline.py` faz o matching por slug (cria produto novo ou reusa existente,
   classificando `category` — cervejas/souvenirs/eventos — por palavra-chave no
   nome só na criação, ver `categorize.py`), upsert da oferta (uma por
   produto+loja) e grava um ponto em `price_history`.
5. Cada execução é registrada em `ingestion_jobs` (visível no admin).

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
`SCRAPER_MAX_WORKERS` (lojas em paralelo, padrão 8).

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
