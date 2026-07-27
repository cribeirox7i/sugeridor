"""Formato comum de saída dos scrapers — o "candidato a oferta" que o pipeline
consome (ver docs/04-conectores-ingestao.md)."""
from dataclasses import dataclass, field


@dataclass
class Candidate:
    product_name: str
    price: float
    url: str
    brand: str | None = None
    currency: str = "BRL"
    image_url: str | None = None
    available: bool = True
    # atributos específicos do tipo (estilo, pais, volume_ml, abv...)
    attributes: dict = field(default_factory=dict)
    # slug do product_type ao qual o candidato pertence
    product_type_slug: str = "cerveja"


@dataclass
class StoreRecord:
    """Loja lida do banco, pronta pra ser coletada. `config` é o JSONB
    `stores.config` — a "receita" que diz como ler aquele site específico
    dentro da plataforma escolhida (ver docs/04-conectores-ingestao.md)."""

    id: str
    name: str
    site_url: str
    platform: str
    config: dict = field(default_factory=dict)
    # 'marketplace' revende várias marcas; 'propria' é a loja da própria
    # cervejaria — nesse caso marca/país do produto SÃO os da loja (ver
    # pipeline.py), não o que a fonte informa (o vendor do Shopify da Japas,
    # por exemplo, traz o estilo da cerveja em vez da marca).
    store_type: str = "marketplace"
    country: str = "Brasil"
    # Forma curta do nome, usada como marca e como prefixo do nome do produto
    # em loja 'propria' (ver migration 0015). Vazio = usa `name`.
    brand_alias: str | None = None

    @property
    def brand(self) -> str:
        """Marca a gravar nos produtos desta loja."""
        return self.brand_alias or self.name
