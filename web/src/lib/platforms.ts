// Plataformas de coleta suportadas pelo scraper (scraper/platforms/), exibidas
// no dropdown do cadastro de loja. MANTER EM SINCRONIA com
// scraper/platforms/__init__.py — cada `key` aqui deve existir lá.
//
// `configExample` é só um texto de apoio mostrado no admin (não é validado
// contra schema nenhum) — o formato real de cada config está documentado no
// docstring do módulo Python correspondente.
export const PLATFORMS: {
  key: string;
  label: string;
  hint: string;
  configExample: string;
}[] = [
  {
    key: "vtex",
    label: "VTEX",
    hint: "site_url = URL da API de busca do catálogo (ex: .../api/catalog_system/pub/products/search/cervejas). Config é opcional.",
    configExample: `{"step": 24, "max_blocks": 200}`,
  },
  {
    key: "shopify",
    label: "Shopify",
    hint: "site_url = qualquer URL da loja (o coletor normaliza para /products.json). Config é opcional.",
    configExample: `{"max_pages": 50}`,
  },
  {
    key: "tray",
    label: "Tray Commerce",
    hint: "site_url = qualquer URL da loja (só o domínio é usado). Sem config necessária.",
    configExample: `{}`,
  },
  {
    key: "jsonld",
    label: "JSON-LD (dados estruturados na página de produto)",
    hint: "site_url = URL de listagem. link_selector aponta os links de produto na listagem.",
    configExample: `{
  "link_selector": ".spot_container a",
  "url_contains": "/produto/",
  "page_param": "pagina",
  "max_pages": 20
}`,
  },
  {
    key: "html",
    label: "HTML genérico (seletores CSS)",
    hint: "item_selector é o container de cada produto na listagem; os demais são relativos a ele.",
    configExample: `{
  "item_selector": ".product-item",
  "name_selector": ".product-title",
  "price_selector": ".price",
  "image_selector": "img",
  "image_attr": "src",
  "link_selector": "a"
}`,
  },
  {
    key: "txt",
    label: "Texto posicional (último recurso)",
    hint: "Para sites sem estrutura previsível. fields é uma lista de {tag, ini, fim, tipo}, tipo em NOM/PRC/IMG/URL.",
    configExample: `{
  "fields": [
    {"tag": "...", "ini": "...", "fim": "...", "tipo": "NOM"},
    {"tag": "...", "ini": "...", "fim": "...", "tipo": "PRC"}
  ]
}`,
  },
];
