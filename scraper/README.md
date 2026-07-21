# Scraper

Coletor de ofertas em Python, rodado pelo GitHub Actions (disparo manual via
`workflow_dispatch`, acionado pelo botão "Coleta" no admin). Ver
[docs/04-conectores-ingestao.md](../docs/04-conectores-ingestao.md).

## Como funciona

1. `run.py` lê do Supabase as lojas que têm `scraper_key` definido.
2. Para cada loja, chama o scraper registrado em `stores/__init__.py`, passando
   a `site_url` (URL de listagem) da loja.
3. Cada scraper devolve uma lista de `Candidate` (nome, marca, preço, etc.).
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

## Adicionar uma nova loja

1. Escreva `stores/<minha_loja>.py` com uma função
   `scrape(listing_url: str) -> list[Candidate]`.
2. Registre em `stores/__init__.py` no `REGISTRY`.
3. No admin, cadastre/edite a loja preenchendo o campo **Scraper** com a chave
   registrada e a **URL de listagem**.

## Lojas suportadas

- `clubedomalte` — Clube do Malte (plataforma FBits). Lê o JSON-LD da página de
  produto (nome, marca, preço, disponibilidade); volume vem do nome via regex.
