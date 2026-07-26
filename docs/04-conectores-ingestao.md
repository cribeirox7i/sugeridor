# Conectores de Ingestão

Os quatro conectores convergem para o mesmo formato de saída — um "candidato a oferta" — que
depois passa pelo matching/dedup contra o catálogo (`products`/`offers`). Desenho original
(pré-implementação):

```ts
type CandidatoOferta = {
  produto_nome: string;
  marca?: string;
  atributos?: Record<string, string | number>; // estilo, pais, volume_ml, abv...
  preco: number;
  moeda: string;           // default 'BRL'
  loja: string;
  url_origem: string;
  imagem_url?: string;
  source_type: 'scrape' | 'email' | 'whatsapp_ocr' | 'manual';
  raw_capture_id: string;  // fk pra raw_captures, auditoria
};
```

O único conector implementado até agora (scraping) usa a forma real `Candidate`
(`scraper/models.py`, Python) — mesma ideia, sem `raw_capture_id` (essa tabela não chegou a ser
necessária, ver seção 1 abaixo).

## 1. Sites (scraping) — implementado, ver [scraper/README.md](../scraper/README.md)

O design original desta seção (scraper por loja em TS, normalizador via Claude API, `raw_captures`)
não é como ficou implementado — a versão real, mais simples, não precisou de IA:

- Python, não TS/Playwright. Workflow do GitHub Actions disparado **manualmente** (botão "Rodar
  coleta" no admin, via `workflow_dispatch`).
- Um coletor por **plataforma de e-commerce** (`vtex`/`shopify`/`tray`/`jsonld`/`html`/`txt`), não
  por loja — cada loja cadastrada escolhe a plataforma e preenche um `config` (JSONB) com os
  detalhes daquele site. Adicionar uma loja nova de plataforma já suportada é só cadastro no
  admin, sem código novo.
- Os coletores extraem campos estruturados direto da API/HTML de cada plataforma — o normalizador
  via Claude API previsto originalmente **não foi necessário** até agora. A tabela `raw_captures`
  existe no schema (migration 0001) mas nenhum código escreve nela hoje; se um site realmente não
  der pra estruturar (texto livre, layout instável), essa peça pode voltar a fazer sentido.
- Lojas rodam **em paralelo** (uma thread por loja) com rate limit **por host** (não trava lojas
  diferentes entre si, mas continua educado com o mesmo site) — necessário pra escalar a 100+
  lojas sem o tempo total virar a soma de cada uma.
- Guard-rails contra coleta descontrolada: teto de `DEFAULT_MAX_ITEMS_PER_STORE` (200) produtos
  por loja por execução (override por `config.max_items`), detecção de página repetida/paginação
  que não termina, e cada etapa de uma cascata de fallback (Tray) ou de paginação (Shopify/VTEX/
  jsonld/HTML) isolada em try/except — uma página ou etapa ruim não descarta o que já foi
  coletado com sucesso antes dela.
- **Classificação de categoria**: produto novo é classificado (`cervejas`/`kit`/`copo`/
  `souvenirs`/`eventos`) por palavra-chave no nome, na criação — lojas de plataforma trazem
  camiseta/copo/ingresso junto com cerveja de verdade. Só `cervejas`+`kit` aparecem no catálogo
  público.
- **Preço inválido nunca é gravado**: candidato com preço `<= 0` é descartado antes de tocar no
  banco; o próprio banco também rejeita via `check (price > 0)` em `offers`/`price_history`
  (defesa em profundidade, não só a aplicação).
- **Enriquecimento pós-coleta** (depois que todas as lojas terminam): ofertas não vistas há mais
  de `site_settings.offer_expiration_days` são desativadas; produtos de loja `store_type =
  'propria'` sem marca/país herdam o nome/país da loja; país ausente também é inferido pela marca
  mais comum entre produtos da mesma marca — sempre só completando o que falta, nunca
  sobrescrevendo dado já gravado.
- Erros (de rede, parsing, ou um site bloqueando o IP do runner do GitHub Actions — acontece,
  ver [06-riscos-e-legal.md](06-riscos-e-legal.md)) vão pra `ingestion_jobs.error_message`, por
  loja — uma loja falhando não derruba as outras.

## 2. E-mail

- Caixa de e-mail dedicada (ex: `ofertas@seudominio` ou um Gmail à parte) recebendo newsletters
  das lojas/promoções.
- Mesmo padrão de disparo manual: outro workflow do GitHub Actions (ou o mesmo, com um passo a
  mais), acionado por um botão separado no admin ("Sincronizar e-mails"), conecta via IMAP, lê
  e-mails não processados, salva o corpo em `raw_captures`.
- Corpo do e-mail (HTML) vai pro normalizador via Claude API: como o formato varia muito de
  remetente pra remetente, um parser de regex fixo quebraria constantemente — o LLM extrai
  produto/preço/loja/link de qualquer estrutura de e-mail razoavelmente.
- Um e-mail pode conter várias ofertas (ex: newsletter com 5 produtos) — o normalizador retorna uma
  lista de `CandidatoOferta`.

## 3. WhatsApp (via print + OCR)

- Fluxo manual e seguro (sem automação de conta, sem risco de ban/ToS):
  1. Você tira print da conversa/status com a promoção.
  2. Sobe o print numa tela do admin (`/admin/whatsapp-upload`).
  3. Imagem vai pro Supabase Storage; o path é salvo em `raw_captures.image_path`.
  4. A imagem é enviada pra Claude API (visão) com um prompt pedindo pra extrair diretamente o
     JSON de `CandidatoOferta` (ou uma lista, se o print tiver mais de uma oferta) — dispensa OCR
     tradicional (Tesseract) porque o modelo multimodal já faz leitura + interpretação numa
     chamada só.
  5. Se a extração vier incompleta (ex: não achou preço), a oferta cai numa fila de **revisão
     manual** no admin em vez de ser publicada errada.

## 4. Cadastro manual

- Formulário simples no admin: escolhe `product_type`, preenche nome/marca/atributos, preço,
  loja, URL, sobe imagem (ou usa a imagem já existente do produto, se já existir).
- Não passa pelo normalizador de IA — os campos já vêm estruturados direto do form.
- Serve tanto pra cadastrar ofertas que nenhum conector pegou quanto pra **corrigir** uma oferta
  que veio errada de um conector automático (edita direto em `offers`).

## Matching / Dedup (comum aos 4 conectores)

Depois que um `CandidatoOferta` existe, precisa decidir: é um produto novo, ou uma atualização de
preço de um produto que já existe no catálogo?

1. Busca por `canonical_slug` (nome normalizado: lowercase, sem acento, sem espaço) + `brand`.
2. Se não achar exato, tenta **fuzzy match** (similaridade de string, ex: `pg_trgm` do Postgres)
   contra `products.name`/`brand` do mesmo `product_type`.
3. Acima de um limiar de confiança, assume que é o mesmo produto e só atualiza/cria a `offer`
   daquela loja + grava em `price_history`.
4. Abaixo do limiar, cria um `product` novo — mas fica marcado como "não revisado" pra você
   confirmar no admin que não é duplicata disfarçada (ex: "Colorado Appia" vs "Appia Colorado").

Esse é o ponto mais delicado do sistema (falso positivo = mistura ofertas de produtos diferentes;
falso negativo = duplica o mesmo produto). Vale começar com o limiar mais conservador (prefere
criar produto novo a juntar errado) e ir ajustando com o uso real.
