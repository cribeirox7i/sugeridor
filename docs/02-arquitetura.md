# Arquitetura

## Stack escolhida

| Camada | Tecnologia | Por quê |
|---|---|---|
| Frontend + site | **Next.js (App Router)** no **Vercel** | SSR/ISR dá cache agressivo pras páginas de listagem (essencial pra "milhares de acessos diários" no plano free), SEO bom (importa pro tráfego orgânico e pro futuro de afiliados), e o mesmo projeto já serve a API. |
| API / backend | **Next.js Route Handlers** (serverless functions no Vercel) | Sem servidor separado pra manter. Usado pro admin, pros filtros, pro endpoint de redirecionamento de afiliado. |
| Banco de dados | **Supabase (Postgres)**, plano free | Já era a escolha do usuário; Postgres dá JSONB (bom pra atributos genéricos por tipo de produto), RLS pra proteger o admin, e Auth pronto. |
| Storage de imagens | **Supabase Storage** (não Google Drive) | Fica no mesmo projeto/plano do banco, tem CDN e URLs públicas prontas pra `<img>`, e regras de acesso (RLS) iguais ao banco. Google Drive não foi feito pra servir imagens em produção (rate limit, URLs instáveis, precisa de conta de serviço). |
| Scraping / jobs pesados | **GitHub Actions**, disparado **manualmente** (botão no admin), não Vercel Cron nem cron agendado | Vercel serverless functions têm timeout curto (10s no plano free, 60s no Pro) — ruim pra rodar scraping em várias lojas. GitHub Actions dá até 6h de execução e é gratuito pra repositório (público ilimitado, privado com cota generosa). No início não há agendamento: você clica um botão no admin quando quiser rodar (1x/dia, a cada 2 dias, etc.); um `schedule:` pode ser adicionado ao mesmo workflow depois, sem redesenho. |
| Linguagem dos scrapers | **Python** (`requests` + `BeautifulSoup` como padrão; `Playwright` para Python só nos sites que exigem renderização JS) | Mais simples e leve que manter um navegador headless pra todo site. Playwright entra caso a caso, só onde for realmente necessário. |
| Extração/normalização | **Claude API (Anthropic)** para os 3 conectores "não estruturados" (HTML de e-mail, texto de scraping variável, imagem de print do WhatsApp) | Em vez de escrever parser/regex por loja (frágil, quebra a cada mudança de layout), usar um LLM com visão pra extrair campos estruturados (produto, marca, preço, moeda, loja, volume) direto do HTML/imagem. Um único "normalizador" serve as 3 fontes. |
| OCR do WhatsApp | Print → upload no admin → **Claude API (visão)** extrai texto e já retorna JSON estruturado | Não precisa de OCR tradicional (Tesseract) + parser separado; o modelo multimodal faz OCR + extração em uma chamada. |
| Autenticação do admin | **Supabase Auth** | Login simples pra você e outros admins futuros. |
| Deploy | **Vercel** apenas (frontend + API + cron leve de "revalidar cache") | GitHub Pages fica de fora do site em si — GitHub só entra como motor de CI/CD (Actions) pro scraping, não como host. |

## Diagrama de fluxo

```
                    ┌─────────────────────────────────────────┐
                    │         FONTES DE DADOS (4)              │
                    │  Sites │ E-mail (IMAP) │ Print WhatsApp  │
                    │              │ Cadastro manual (admin)   │
                    └──────┬────────────┬───────────┬─────────┘
                           │            │           │
              GitHub Actions        GitHub Actions   Upload direto
              (workflow_dispatch,   (workflow_dispatch, no admin (Next.js)
               botão no admin)       botão no admin)
                           │            │           │
                           └─────┬──────┴─────┬─────┘
                                 ▼             ▼
                      ┌─────────────────────────────┐
                      │   Normalizador (Claude API)   │
                      │  raw → {produto, preço, loja,│
                      │   moeda, atributos, imagem}  │
                      └───────────────┬───────────────┘
                                      ▼
                      ┌─────────────────────────────┐
                      │   Matching / Dedup           │
                      │  (produto já existe? junta   │
                      │   com o catálogo ou cria novo)│
                      └───────────────┬───────────────┘
                                      ▼
                         ┌─────────────────────┐
                         │   Supabase (Postgres) │
                         │  products / offers /  │
                         │  price_history /       │
                         │  stores / alerts       │
                         └──────────┬─────────────┘
                                    │
                       ┌────────────┴─────────────┐
                       ▼                           ▼
              Next.js no Vercel              Cálculo de alerta
              (site público + admin,          (comparar preço novo
               ISR com cache)                  vs histórico, disparar
                                                notificação se queda
                                                >= X% parametrizável)
```

## Por que não usar Vercel Cron para o scraping

Cron jobs do Vercel existem, mas cada execução é uma serverless function comum — sujeita ao
limite de tempo do plano (10s no Hobby). Rodar scraping (principalmente onde precisa de navegador
headless) em várias lojas sequencialmente estoura esse limite fácil. GitHub Actions resolve isso
sem custo: um workflow roda em uma VM completa por até 6h, e no fim grava os resultados direto no
Supabase via `service_role` key (nunca exposta no frontend).

O Vercel continua sendo usado para um cron **leve**: revalidar o cache ISR das páginas de listagem
depois que os dados mudam (webhook disparado pelo GitHub Actions ao terminar, ou revalidação por
tempo).

## Disparo manual via botão no admin (em vez de agendamento)

No início, nenhum conector roda sozinho por tempo — você decide quando rodar (ex: 1x/dia, a cada
2 dias) clicando um botão no admin. Mecanismo:

1. O workflow do GitHub Actions usa o gatilho `workflow_dispatch` (permite disparo via API/UI do
   GitHub), em vez de `schedule`.
2. Uma rota da API do Next.js (ex: `POST /api/admin/trigger-scrape`), protegida por
   autenticação do admin, chama a API do GitHub:
   `POST /repos/{owner}/{repo}/actions/workflows/scrape.yml/dispatches`.
3. Essa chamada usa um token do GitHub (fine-grained PAT, escopo só de `actions: write` nesse
   repositório) guardado como variável de ambiente **só no servidor** do Vercel — nunca exposto ao
   navegador.
4. O admin lê `ingestion_jobs` (ver [03-modelo-dados.md](03-modelo-dados.md)) pra mostrar
   status/resultado da última execução (em andamento, sucesso, erro).
5. O body da chamada aceita `{ storeIds: [...] }` opcional, repassado como input `store_ids` do
   workflow — é o que o botão "Coletar selecionadas" da tela de Lojas usa. Sem body, coleta todas
   as lojas marcadas.

**Estado real:** as três variáveis (`GITHUB_PAT`/`GITHUB_OWNER`/`GITHUB_REPO`) ainda **não** estão
configuradas no Vercel, então o botão devolve 503 "Coleta não configurada" e as coletas até aqui
foram disparadas pela aba Actions do GitHub. O PAT precisa ser fine-grained com permissão
**Actions: Read and write** só neste repositório.

Ao disparar pelo GitHub, usar **"Run workflow"** e nunca **"Re-run jobs"**: re-run reusa o
`head_sha` da execução original, ou seja, roda o código de quando aquela execução foi criada. Isso
já custou uma sessão inteira de diagnóstico — 7 re-runs reproduzindo erros já corrigidos.

Quando fizer sentido automatizar, basta adicionar um gatilho `schedule:` ao mesmo arquivo `.yml`
— o botão manual continua funcionando em paralelo, não é uma migração, é um acréscimo.

## Escalabilidade no plano free

- **GitHub Actions**: o repositório é **público**, então os minutos de runner são gratuitos e
  ilimitados — uma coleta com 4 shards + enrich soma ~6 min de runner e não consome cota. Só passaria
  a consumir se o repositório virasse privado.
- **Supabase free**: 500MB de banco, 1GB de storage, ~5GB de egress/mês, pausa o projeto após 7 dias
  de inatividade — mas como a coleta roda periodicamente, o projeto nunca fica inativo por muito
  tempo. No plano free **não há cobrança por excedente**: o Supabase restringe o projeto em vez de
  emitir fatura. Usar o cliente `supabase-js` (via PostgREST) em vez de conexão Postgres direta evita
  esgotar o pool de conexões em ambiente serverless.
  - **O que cresce é `price_history`.** Projeção medida com a média real de 89 ofertas/loja: 100
    lojas a 1 coleta/dia dariam ~3,2M linhas/ano (~500MB), estourando o free tier em ~10-13 meses;
    150 lojas, em ~7-9 meses. Duas decisões já tomadas por causa disso: gravar ponto **só quando o
    preço muda** e materializar a queda em `offers.drop_percent` (a home parou de carregar o
    histórico de todas as ofertas a cada render — com 13 mil ofertas aquilo seriam dezenas de MB de
    egress por visita, o que esgotaria a banda antes do disco).
  - **Coletar 1-2x/dia, não mais.** Além do respeito às lojas, coleta muito frequente *piora* a
    detecção de queda: o preço de referência é a média do histórico anterior, e dezenas de pontos
    idênticos por dia diluem essa média, fazendo uma queda real parecer menor do que é.
- **Limite silencioso do PostgREST**: qualquer leitura devolve no máximo 1000 linhas com 200 OK, sem
  erro. Toda consulta que pode passar disso precisa paginar explicitamente (`db.select` no scraper,
  `.range()` no front) — sem isso a home simplesmente para de mostrar o resto do catálogo e o
  enriquecimento ignora produtos, sem nenhum sinal.
- **Vercel free**: ISR com `revalidate` (ex: a cada 15-30 min) faz as páginas de listagem serem
  servidas do cache/edge, não do banco, em quase todo request. Isso é o que permite aguentar
  milhares de acessos diários sem estourar o free tier de nenhum dos dois.
- **Imagens**: Supabase Storage serve com CDN; ainda assim, vale usar `next/image` com otimização
  pra não estourar banda.

## Telas do admin (organização atual)

Sete itens no menu (Início, Lojas, Produtos, Ofertas, Classificação, Ferramentas, Config). A
organização já mudou duas vezes: telas que eram só um formulário foram absorvidas por onde o assunto
pertence, em vez de virarem abas próprias.

| Tela | O que tem |
|---|---|
| **Início** | Contadores de lojas/produtos/ofertas |
| **Lojas** | CRUD (identificação, apelido, país, tipo, prazo de expiração; coleta em acordeon com logo/descrição/config JSON) · seleção em lote (excluir, incluir/tirar da coleta, **coletar selecionadas**) · toggle de inclusão na coleta por linha · botão de disparo geral · histórico das últimas 20 execuções. **Absorveu a antiga tela Coleta** — tudo lá era sobre lojas |
| **Produtos** | CRUD + normalizar nomes |
| **Ofertas** | CRUD + filtro por loja/data + seleção e exclusão em lote |
| **Classificação** | Palavras-chave de `category` por categoria + reclassificar existentes |
| **Ferramentas** | Ações de curadoria em lote (normalizar nomes, reclassificar, regravar marca e nome das lojas próprias, ressincronizar identificadores, **regravar países**) · regras **de/para** com **aplicar POR REGRA** · duas listas de duplicados (por nome e as que as substituições criariam) com **mesclar/ignorar em lote** e desfazer dos ignorados |
| **Config** | Expiração global de ofertas · alertas de queda · **logomarca** (absorveu a antiga tela Logomarca) |

Convenções que se repetem e vale seguir ao criar tela nova:

- **Ação de escrita em lote é chamada direto do client** (não por `<form action>`) quando precisa
  devolver `{ error }` sem navegar — o padrão nasceu em `OffersTable` e se repete em `StoresTable` e
  na mesclagem de produtos. Toda ação **deve checar o erro**: três ações contavam o que pretendiam
  mudar e exibiam sucesso sem ter gravado nada.
- **Ação de curadoria é idempotente e informa quantas linhas mudaram de fato**, não quantas
  pretendia mudar.
- **Ação em lote devolve QUAIS itens deram certo, não só o total** — sucesso parcial é o caso comum
  (uma oferta com disparo de alerta vinculado barra a exclusão daquele grupo e não afeta os outros),
  e sem os índices a tela só poderia adivinhar o que marcar como resolvido.
- **O estado da lista (modo cartões/lista + busca) tem que sobreviver ao formulário.** Os links de
  incluir/editar/cancelar, o fechar do modal **e os redirects pós-salvar** passam por
  `web/src/lib/adminNav.ts`. As Server Actions não veem a URL de origem, então recebem esses
  parâmetros por campo escondido — sem essa parte, salvar devolvia o usuário pro modo Lista.
- **Modal de cadastro/edição não fecha por clique fora** (`Modal.tsx`, `dismissOnBackdrop` com
  default `false`): perder o formulário digitado por um clique acidental era o comportamento
  anterior. Só o popup público de produto passa `true` — ali é uma espiada e não há nada a perder.
  Escape continua fechando em todos.

## Páginas públicas

| Rota | O que é |
|---|---|
| `/` | Catálogo. Barra de ferramentas fixa (busca + país + "mais filtros e ordenação" + carrossel de lojas + "Todas as lojas"), grid de 5 cards por linha no desktop, destaques de queda |
| `/?loja=<id>` | "Página da loja": mesma barra (sem o select de loja), cabeçalho com logo à esquerda e nome/descrição à direita |
| `/lojas` | Vitrine das lojas com oferta ativa — nome, logo, descrição e quantos produtos, em cartões ou lista. É a versão só-leitura da lista de lojas do admin, sem nada de gestão |
| `/produto/[slug]` | Produto com histórico de preço e ofertas por loja (o mesmo conteúdo aparece como popup na home) |
| `/sobre`, `/termos` | Institucionais |

A largura da área útil (976px) vive numa constante só, `web/src/lib/layout.ts::PUBLIC_CONTAINER` —
eram quatro literais espalhados (header, barra, conteúdo e Footer) e o desalinhamento do rodapé com
o grid já aconteceu por causa disso.

Duas armadilhas de layout que essa barra já produziu, e que valem para qualquer divisão de espaço
horizontal aqui: **quem rola é que deve ser flexível** (o carrossel tem largura definida e a coluna
de filtros cresce no que resta, com piso — o contrário esmagou a busca até largura zero quando as
lojas passaram de 9), e **`shrink-0` faz a largura virar `max-content`**, então um bloco recolhível
dentro dele vaza a faixa toda quando abre. E o caso do mobile: um campo `flex-1 min-w-0` disputando
linha com irmãos rígidos é comprimido a poucos pixels — no mobile a busca ocupa a linha inteira e os
demais descem por `flex-wrap`.

## Preparando o terreno pra afiliados (sem implementar ainda)

Desde o dia 1, o link de uma oferta no site aponta para uma rota interna de redirecionamento —
`/go/[offerId]` — que hoje só faz um redirect 302 pra URL original da loja. Quando entrar num
programa de afiliados, essa rota passa a envelopar a URL com o parâmetro de afiliado, sem precisar
tocar em nenhum link espalhado pelo site. Detalhe no [03-modelo-dados.md](03-modelo-dados.md).
