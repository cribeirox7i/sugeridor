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

1. `run.py` lê do Supabase as lojas que têm `platform` definido.
2. Para cada loja, chama o coletor da plataforma, passando `site_url` e `config`.
3. Cada coletor devolve uma lista de `Candidate` (nome, marca, preço, etc.).
4. `pipeline.py` faz o matching por slug (cria produto novo ou reusa existente),
   upsert da oferta (uma por produto+loja) e grava um ponto em `price_history`.
5. Cada execução é registrada em `ingestion_jobs` (visível no admin).

O scraper escreve usando a **service_role key** do Supabase (ignora RLS). Essa
chave nunca vai pro frontend — só existe como secret do GitHub Actions.

## Rodar localmente

```bash
pip install -r scraper/requirements.txt
export SUPABASE_URL="https://<ref>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service_role key>"
python -m scraper.run
```

Variáveis opcionais: `SCRAPER_MAX_PAGES` (padrão 20), `SCRAPER_REQUEST_DELAY`
(segundos entre requests, padrão 1.0), `SCRAPER_USER_AGENT`.

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
