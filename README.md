# Sugeridor — Hub de Ofertas

Hub de ofertas de cervejas artesanais e especiais, construído como engine genérica reutilizável
pra outros tipos de produto (vinho, livros, etc.) no futuro.

Em produção: [sugeridor.vercel.app](https://sugeridor.vercel.app) (repo `cribeirox7i/sugeridor`,
branch `main`).

## Documentos

1. [Visão geral](docs/01-visao-geral.md)
2. [Arquitetura](docs/02-arquitetura.md)
3. [Modelo de dados](docs/03-modelo-dados.md)
4. [Conectores de ingestão](docs/04-conectores-ingestao.md)
5. [Roadmap](docs/05-roadmap.md)
6. [Riscos e legal](docs/06-riscos-e-legal.md)

## Stack (resumo)

Next.js 16 (App Router) + Vercel (site, admin, API) · Supabase (Postgres + Auth + Storage) ·
GitHub Actions (scraping em shards paralelos, disparo manual) · Claude API (reservado
pra normalização de dados não estruturados — e-mail/WhatsApp OCR — ainda não ativado, ver roadmap).

## Estado atual

Fases 0 a 3 do roadmap concluídas e em produção, mais uma reforma de UX, lotes de melhoria mobile, a
correção de uma queda em produção e levas de trabalho sobre identidade de produto, escala do scraper,
ferramentas de curadoria e reorganização do catálogo público — ver
[docs/05-roadmap.md](docs/05-roadmap.md) para o detalhe.

- Catálogo público numa **barra de ferramentas única e fixa**: só busca e um botão **"Filtros"**
  ficam visíveis (país entrou pro recolhível junto com estilo/marca/loja/preço/ordenação) — o espaço
  ganho foi pro carrossel de lojas, que cresceu de 340 pra 480px. Grid de 5 cards por linha no
  desktop, área útil de 976px, **um card por PRODUTO** (não por oferta — produto vendido em duas
  lojas mostra o preço mais barato e "Preços" lista todas as lojas, incluindo a que já está no
  card). Na "página da loja" (`/?loja=`) o card mostra o preço DAQUELA loja, nunca o mais barato do
  catálogo geral. Página de produto com histórico de preço, popup de produto, vitrine **`/lojas`**,
  tema claro/escuro, pt/en/es. Fundo branco fixo (não muda com o tema) por trás de toda imagem de
  produto e logo de loja, pra imagem com fundo transparente ou branco embutido ficar visualmente
  padronizada nos dois temas.
- **O nome do produto é marca + descritivo** — "Dogma IPA 473 ml", não "IPA" — em Title Case, com
  siglas de estilo preservadas e a **medida separada do número**. Em loja própria a marca vem do
  apelido da loja e é prefixada ao nome quando falta. Em loja marketplace, um **catálogo normalizado
  de marcas** (`/admin/marcas`, nome canônico + país + variações) é a autoridade sobre a marca
  quando a fonte bate com algum alias cadastrado — substitui o de/para pra marca. O `canonical_slug`
  é a identidade do produto e inclui a marca de propósito, para não agregar ofertas de produtos
  diferentes de mesmo nome.
- **Produto pode ser marcado como oculto** (curadoria manual, sem afetar a coleta) e some do
  catálogo público. **Loja pode ser marcada como inativa** (some do site e sai da coleta,
  separado de "incluir na coleta"). **Loja pode ser um "vendedor WhatsApp"** (cadastro manual, sem
  site — "Ver oferta" abre o wa.me da loja com uma mensagem pronta em vez de um link de produto).
- Admin com 8 telas: **Lojas** (CRUD + seleção em lote + disparo da coleta + histórico de
  execuções — absorveu a antiga tela Coleta; loja nova nasce **própria** por padrão, não
  marketplace), Produtos, **Marcas** (catálogo normalizado nome+país), Ofertas, Classificação
  (palavras-chave de categoria), **Ferramentas** (curadoria em lote, regras de/para de NOME
  aplicáveis uma a uma, e duas listas de duplicados com mesclar/ignorar em lote) e Config (alertas,
  expiração, logomarca e **automação pós-coleta**). A tela Início foi removida — cada tela mostra a
  própria contagem.
- **Automação pós-coleta** (opt-in, dois toggles em `/admin/config`): aplicar as regras de/para
  ativas e mesclar duplicatas sozinho no fim de cada coleta, sem precisar voltar no admin. Roda no
  site (não no scraper Python) via um passo novo no workflow do GitHub Actions que chama uma rota
  autenticada depois do `enrich` — reaproveita a mesma lógica dos botões manuais de Ferramentas
  (`web/src/lib/postCollect.ts`). Exige secrets novos ainda não configurados, ver
  [docs/05-roadmap.md](docs/05-roadmap.md).
- Scraper Python config-driven por plataforma (vtex/shopify/tray/jsonld/html/txt), disparado
  manualmente via GitHub Actions em **4 shards paralelos**, com rate limit por host, gravação em
  lote no banco, leituras paginadas, guard-rail de 200 produtos/loja, classificação de categoria por
  palavra-chave (editável no admin), expiração com prazo por loja e coleta seletiva por loja.
- **Produto esgotado na loja sai das ofertas na mesma coleta** (shopify/vtex/tray/jsonld — `html` e
  `txt` não expõem esse sinal).
- A plataforma `txt` (último recurso, busca posicional) **não exige escrever JSON à mão**: o
  formulário de loja detecta os delimitadores a partir de um produto de exemplo, ou aceita
  preenchimento manual das tags — os dois com teste contra a página real antes de salvar.
- `price_history` recebe ponto **só quando o preço muda** e só para oferta disponível; a queda
  percentual é materializada em `offers.drop_percent` por trigger, então a home não carrega
  histórico a cada render.
- Preço inválido (`<= 0`) nunca é gravado — descartado na aplicação e bloqueado por constraint no
  banco (defesa em profundidade).
- Migrations aplicadas: `0001` a `0018`. `0019` (RLS de `ingestion_jobs`), `0020` (produto oculto,
  loja ativa/inativa, loja WhatsApp) e `0021` (tabelas `brands`/`brand_aliases`) escritas, **ainda
  não rodadas** pelo usuário — o código já tolera a ausência delas (fallback sem quebrar o site,
  ver docs/05-roadmap.md), mas nenhuma das telas/campos novos funciona de verdade antes de rodar.

**Pausado por decisão do usuário** (evitar dependência de API paga do Claude por ora): Fase 4
(e-mail como fonte), Fase 5 (WhatsApp via print+OCR), e envio de e-mail de verdade para os
alertas de preço. Retomar só quando/se o usuário pedir explicitamente.
