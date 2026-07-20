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

Quando fizer sentido automatizar, basta adicionar um gatilho `schedule:` ao mesmo arquivo `.yml`
— o botão manual continua funcionando em paralelo, não é uma migração, é um acréscimo.

## Escalabilidade no plano free

- **Supabase free**: 500MB de banco, 1GB de storage, pausa o projeto após 7 dias de inatividade —
  mas como o cron de scraping roda periodicamente, o projeto nunca fica inativo por muito tempo.
  Usar o cliente `supabase-js` (via PostgREST) em vez de conexão Postgres direta evita esgotar o
  pool de conexões em ambiente serverless.
- **Vercel free**: ISR com `revalidate` (ex: a cada 15-30 min) faz as páginas de listagem serem
  servidas do cache/edge, não do banco, em quase todo request. Isso é o que permite aguentar
  milhares de acessos diários sem estourar o free tier de nenhum dos dois.
- **Imagens**: Supabase Storage serve com CDN; ainda assim, vale usar `next/image` com otimização
  pra não estourar banda.

## Preparando o terreno pra afiliados (sem implementar ainda)

Desde o dia 1, o link de uma oferta no site aponta para uma rota interna de redirecionamento —
`/go/[offerId]` — que hoje só faz um redirect 302 pra URL original da loja. Quando entrar num
programa de afiliados, essa rota passa a envelopar a URL com o parâmetro de afiliado, sem precisar
tocar em nenhum link espalhado pelo site. Detalhe no [03-modelo-dados.md](03-modelo-dados.md).
