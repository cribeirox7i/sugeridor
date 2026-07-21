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
