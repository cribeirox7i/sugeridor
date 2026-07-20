# Conectores de Ingestão

Os quatro conectores convergem para o mesmo formato de saída — um "candidato a oferta" — que
depois passa pelo matching/dedup contra o catálogo (`products`/`offers`). Formato comum:

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

## 1. Sites (scraping)

- Workflow do GitHub Actions disparado **manualmente** (botão "Rodar coleta" no admin, via
  `workflow_dispatch` — ver [02-arquitetura.md](02-arquitetura.md)) roda um script Python por loja
  cadastrada em `stores`. Agendamento automático fica pra depois, se fizer sentido.
- Duas estratégias por loja, conforme o site:
  - **`requests` + `BeautifulSoup`** pra sites com HTML estático simples (rápido, barato) — padrão.
  - **Playwright (Python)** pra sites com conteúdo carregado via JS (mais pesado, mas GitHub
    Actions aguenta), só onde for necessário.
- Cada scraper é um módulo pequeno e isolado por loja (`scrapers/loja-x.ts`), pra que um site
  quebrar não derrube os outros. Erros vão pra `ingestion_jobs.error_message`.
- O HTML relevante (ou os campos já extraídos via seletor CSS, se o scraper for determinístico) é
  salvo em `raw_captures`. Se o scraper já extrai campos estruturados direto (seletor CSS
  confiável), pode pular a etapa de IA; senão, manda o trecho de HTML pro normalizador via Claude
  API pra extrair os campos (mais resiliente a mudanças de layout do que manter regex/seletor
  frágil por loja).
- Resultado grava em `raw_captures` + chama a função de matching/dedup (ver abaixo).

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
