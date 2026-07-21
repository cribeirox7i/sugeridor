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
