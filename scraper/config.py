"""Configuração do scraper — lê variáveis de ambiente (injetadas pelo GitHub
Actions a partir dos secrets do repositório)."""
import os

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
# service_role key: ignora RLS. NUNCA exposta no frontend — só aqui, no job.
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# User-Agent identificável e educado (ver docs/06-riscos-e-legal.md).
USER_AGENT = os.environ.get(
    "SCRAPER_USER_AGENT",
    "SugeridorBot/1.0 (+https://sugeridor.vercel.app; coletor de ofertas)",
)

# Intervalo entre requests ao mesmo site, em segundos (rate limit educado).
REQUEST_DELAY = float(os.environ.get("SCRAPER_REQUEST_DELAY", "1.0"))

# Teto de páginas de listagem por loja, salvaguarda contra loop.
MAX_PAGES = int(os.environ.get("SCRAPER_MAX_PAGES", "20"))

# Teto de produtos coletados por loja por execução — guard-rail genérico
# contra qualquer coisa que faça um coletor rodar mais do que devia (loop
# de paginação, CDN devolvendo página repetida, config errada, catálogo
# real gigante). Cada coletor para assim que atingir esse número,
# independente de quantas páginas/blocos faltariam. Lojas com catálogo
# real maior que isso podem sobrescrever via `config.max_items` (JSONB da
# loja no admin) — ver scraper/README.md.
DEFAULT_MAX_ITEMS_PER_STORE = int(os.environ.get("SCRAPER_MAX_ITEMS_PER_STORE", "200"))

# Quantas lojas coletar em paralelo (threads) — são hosts diferentes, então o
# rate limit por host (ver http.py) continua respeitado dentro de cada uma;
# isso só evita que uma loja lenta bloqueie a fila inteira das outras 100+.
MAX_WORKERS = int(os.environ.get("SCRAPER_MAX_WORKERS", "8"))

# ── Sharding: dividir as lojas entre execuções paralelas ──────────
# O gargalo pra escalar não é o banco nem o paralelismo entre lojas: o coletor
# jsonld abre UMA página por produto, e o rate limit educado (1 req/s por site)
# faz uma loja de 200 produtos levar ~3min. A 100 lojas isso passa de 5 horas
# num job só — muito além do timeout.
#
# Rodar em N execuções paralelas (matrix do GitHub Actions), cada uma com uma
# fatia das lojas, divide o tempo por N SEM ficar mais agressivo com nenhum
# site: cada loja continua recebendo 1 req/s, só em runners diferentes.
SHARD_INDEX = int(os.environ.get("SCRAPER_SHARD_INDEX", "0"))
SHARD_TOTAL = int(os.environ.get("SCRAPER_SHARD_TOTAL", "1"))

# Coleta de um subconjunto específico de lojas (ids separados por vírgula),
# usada pelo botão "Coletar selecionadas" do admin. Vazio = coleta todas as
# lojas marcadas, o comportamento normal. Combina com o sharding: cada shard
# processa a fatia dele DENTRO da seleção.
STORE_IDS = [s.strip() for s in os.environ.get("SCRAPER_STORE_IDS", "").split(",") if s.strip()]


def require_config() -> None:
    missing = [
        name
        for name, val in [
            ("SUPABASE_URL", SUPABASE_URL),
            ("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_ROLE_KEY),
        ]
        if not val
    ]
    if missing:
        raise SystemExit(f"Faltam variáveis de ambiente: {', '.join(missing)}")
