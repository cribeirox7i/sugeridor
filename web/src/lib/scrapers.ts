// Scrapers disponíveis, exibidos no dropdown do cadastro de loja.
//
// MANTER EM SINCRONIA com o REGISTRY do Python em scraper/stores/__init__.py:
// cada `key` aqui deve existir lá. Ao adicionar uma nova loja ao scraper,
// registre nos dois lugares.
export const AVAILABLE_SCRAPERS: { key: string; label: string }[] = [
  { key: "clubedomalte", label: "Clube do Malte" },
];
