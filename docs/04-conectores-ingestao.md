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
- **Sharding entre execuções paralelas**: o workflow tem uma matriz de 4 shards e cada um coleta a
  fatia de lojas que corresponde a ele (hash do id da loja). O gargalo pra crescer não é o banco nem
  o paralelismo entre lojas, é o coletor `jsonld`, que abre **uma página por produto** — a 1 req/s
  uma loja de 200 produtos leva ~3min, e a 100 lojas isso passaria de 5h num job só. Sharding divide
  o tempo **sem ficar mais agressivo com nenhuma loja**: cada site continua recebendo 1 req/s, só em
  runners diferentes. Ver "Escala" em scraper/README.md — a lista `shard:` e `SCRAPER_SHARD_TOTAL`
  precisam bater, senão parte das lojas nunca é coletada.
- **Gravação em lote**: eram 3 idas ao banco por produto (select do slug, upsert da oferta, insert do
  histórico), o que a 100 lojas × 200 itens dá ~60 mil requests — só de latência isso estoura o
  tempo de job. Agora é um punhado de requests por loja. Cuidado registrado no código: o Postgres
  recusa o comando inteiro se a mesma chave de conflito aparecer duas vezes no mesmo lote, daí o
  dedup por slug e por (product_id, store_id) antes de enviar; e **upsert do PostgREST exige linha
  completa** — patch parcial vai por PATCH (`db.update_by_id_many`), senão os NOT NULL são violados.
- **Leituras paginadas**: o PostgREST corta a resposta em 1000 linhas com 200 OK, sem avisar.
  `db.select` pagina até a página vir incompleta — sem isso o enriquecimento simplesmente ignorava
  os produtos além do milésimo.
- Guard-rails contra coleta descontrolada: teto de `DEFAULT_MAX_ITEMS_PER_STORE` (200) produtos
  por loja por execução (override por `config.max_items`), detecção de página repetida/paginação
  que não termina, e cada etapa de uma cascata de fallback (Tray) ou de paginação (Shopify/VTEX/
  jsonld/HTML) isolada em try/except — uma página ou etapa ruim não descarta o que já foi
  coletado com sucesso antes dela.
- **Classificação de categoria**: produto novo é classificado (`cervejas`/`kit`/`copo`/
  `souvenirs`/`eventos`) por palavra-chave no nome, na criação — lojas de plataforma trazem
  camiseta/copo/ingresso junto com cerveja de verdade. Só `cervejas`+`kit` aparecem no catálogo
  público. As palavras vivem em `category_keywords` (editáveis em `/admin/classificacao`), lidas uma
  vez por execução e cacheadas; a ordem de prioridade entre categorias continua fixa no código.
- **Identidade do produto (nome e slug)**: o nome é **marca + descritivo**. Em loja `propria` o
  scraper grava `brand` = apelido da loja e **prefixa a marca no nome** quando ela não está lá
  ("IPA" → "Dogma IPA"), porque num agregador "IPA" não identifica nada. Isso vale só pra loja
  própria: no marketplace a marca vem do vendor e traz razão social, distribuidor ou placeholder, e
  prefixar pioraria o nome. Tudo isso acontece **antes** do slug ser calculado — o slug deriva de
  marca+nome, então corrigir depois deixaria a chave errada e a coleta seguinte criaria duplicata.
- **Preço inválido nunca é gravado**: candidato com preço `<= 0` é descartado antes de tocar no
  banco; o próprio banco também rejeita via `check (price > 0)` em `offers`/`price_history`
  (defesa em profundidade, não só a aplicação).
- **Produto ESGOTADO sai das ofertas na mesma coleta.** `Candidate.available` é mapeado direto para
  `offers.active`, então não se espera a expiração por `last_seen_at` (que levaria 45 dias). Cada
  plataforma publica isso de um jeito diferente, e `scraper/extract.py::parse_available` normaliza:

  | plataforma | sinal |
  |---|---|
  | `shopify` | `any(v.available)` entre as variantes — variante é tamanho, então lata esgotada + garrafa em estoque ainda é produto comprável. Só o endpoint de **listagem** traz o campo; o de produto único (`/products/<handle>.json`) devolve `null` |
  | `vtex` | `commertialOffer.AvailableQuantity > 0`, com `IsAvailable` como reserva |
  | `tray` | `available` — **é a STRING `"0"`/`"1"`** |
  | `jsonld` | `offers.availability` do schema.org (`InStock`/`OutOfStock`/`SoldOut`) |
  | `html`, `txt` | sem sinal estruturado — não implementado |

  **A armadilha do Tray:** `available` vem como a string `"0"`, que é *truthy* em Python — um
  `bool(value)` marcaria como disponível justamente o que está esgotado (9 de 30 produtos numa
  página real). É a mesma família do bug de link/imagem virem como objeto em vez de string nessa
  API. E `availability` não serve de reserva ali: aparece `"Imediata"` em produto com
  `available="0"`.

  Sem sinal reconhecível, `parse_available` assume **disponível** — melhor mostrar a oferta e deixar
  a expiração cuidar do que esconder catálogo por um campo que a loja não publica.
- **Medida separada do número no nome**: `separate_units` (em `clean_product_name`, portanto em todo
  coletor) transforma "Erdinger Urweisse500ml" em "Erdinger Urweisse 500 ml" — dois cortes,
  palavra↔número e número↔unidade. Sem o primeiro, "IPA355ml" é uma palavra só e o Title Case a
  estragava ("Ipa355ml"). Espelhado em `web/src/lib/text.ts::separateUnits`; mudar de um lado só
  dessincroniza o slug (ver o aviso em 03-modelo-dados.md).
- **Histórico só quando o preço muda**: `price_history` recebe ponto apenas se o preço difere do
  gravado (ou é a primeira vez que a oferta é vista). `offers.last_seen_at` continua sendo
  atualizado a cada coleta, então a expiração não é afetada. Ver 03-modelo-dados.md pro porquê.
- **Enriquecimento pós-coleta** — roda **uma vez só**, num job separado que depende de todos os
  shards (`python -m scraper.run --enrich-only`), porque olha o catálogo inteiro: rodá-lo em N
  shards seria N vezes o mesmo trabalho disputando as mesmas linhas. Ofertas não vistas há mais de
  `stores.offer_expiration_days` (ou o global de `site_settings`, se a loja não tiver o seu) são
  desativadas; produtos de loja `store_type = 'propria'` sem marca/país herdam o nome/país da loja;
  país ausente também é inferido pela marca mais comum entre produtos da mesma marca — sempre só
  completando o que falta, nunca sobrescrevendo dado já gravado.
- **Coleta seletiva**: o `workflow_dispatch` aceita `store_ids` (csv), repassado como
  `SCRAPER_STORE_IDS` e aplicado **antes** do sharding. É o que o botão "Coletar selecionadas" da
  tela de Lojas usa.
- Erros (de rede, parsing, ou um site bloqueando o IP do runner do GitHub Actions — acontece,
  ver [06-riscos-e-legal.md](06-riscos-e-legal.md)) vão pra `ingestion_jobs.error_message`, por
  loja — uma loja falhando não derruba as outras.

### Configurar a plataforma `txt` sem escrever JSON à mão

`txt` é o último recurso: busca posicional por delimitadores, para loja de formato próprio sem API
nem estrutura CSS aproveitável (comum em cervejaria pequena). O `config.fields` é uma lista de
`{tag, ini, fim, tipo}` — `tipo` em `NOM`/`PRC`/`IMG`/`URL`/`MARCA`/`PAIS`/`ESTILO`.

Escrever isso à mão exige ler o HTML fonte, então o formulário de loja tem um painel com **duas
abas** quando a plataforma é `txt`:

- **Detectar automaticamente** — o admin dá um produto de exemplo (nome, preço, e opcionalmente
  marca/país/estilo/URLs) e `web/src/lib/detectTxtFields.ts` deriva os delimitadores. Sem nenhum
  exemplo informado, o sistema busca a **oferta ativa mais recente daquela loja** no banco e usa o
  produto já coletado — em loja própria tenta o nome como está gravado e, se não achar na página,
  de novo sem o prefixo de marca (o pipeline prefixa na gravação; o texto cru do site não tem).
- **Preencher tags manualmente** — uma linha por campo com **Início** e **Fim** (obrigatórios) e
  **Tag** (opcional), reordenáveis. Existe porque a detecção automática não acerta em todo site.

Nos dois casos há um **teste contra a página real** antes de salvar
(`web/src/lib/parseTxtConfig.ts`, porte do loop de `txt.py`), mostrando quantos produtos foram
reconhecidos e uma prévia. Dois erros que o teste existe para expor:

1. **A ORDEM dos campos tem que ser a do HTML.** O parser só anda para frente: cada campo busca a
   partir de onde o anterior parou. Listar na ordem lógica (nome, preço, marca…) quando o card
   exibe "imagem, nome, marca, país, estilo, preço, link" faz o parser, ao processar o preço, já ter
   passado de marca/país/estilo — e encontrá-los no **produto seguinte**.
2. **A Tag não pode estar no MEIO do Início.** O parser procura o `ini` *a partir da posição da
   `tag`*. Com `tag='class="nome"'` e `ini='<h3 class="nome">'` — combinação totalmente natural de
   digitar — a busca começa depois da tag e acha a ocorrência do produto seguinte, embaralhando os
   campos **sem erro nenhum**. Por isso a tag é opcional (em branco usa o próprio `ini`, que é o que
   a detecção automática já faz nos campos não-âncora) e a tela avisa quando detecta esse padrão.
   Só a **primeira** linha precisa de tag de verdade: é a âncora que marca onde cada produto começa.

A pré-visualização também bloqueia um caso específico: **todos os preços iguais ao do exemplo**,
sintoma de delimitador de preço grudado no dígito daquele produto. O preço ficaria travado para
sempre, e o `check (price > 0)` não pega isso — o valor É positivo, só está sempre errado.

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
