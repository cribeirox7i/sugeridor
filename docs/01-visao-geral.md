# Visão Geral — Hub de Ofertas (nome provisório: "Sugeridor")

## O que é

Um hub de ofertas para produtos de nicho, começando por **cervejas artesanais e especiais**,
construído como uma **engine genérica** capaz de suportar outros tipos de produto no futuro
(vinhos, livros, etc.) sem reescrever a base.

O sistema varre múltiplas origens de dados, normaliza tudo em um catálogo único de produtos e
ofertas, guarda histórico de preço, e alerta quando um preço cai significativamente abaixo do
normal. Cada oferta linka para a página de venda original; futuramente esses links serão trocados
por links de afiliado.

## Fontes de dados (todas desenhadas desde o início, arquitetura plugável)

| Fonte | Mecanismo | Observação |
|---|---|---|
| Sites (raspagem) | Scraper Node (Playwright/Cheerio) rodando via GitHub Actions | Ver [04-conectores-ingestao.md](04-conectores-ingestao.md) |
| E-mail | Leitura via IMAP de uma caixa dedicada + extração por IA | Newsletters/promoções encaminhadas ou assinadas |
| WhatsApp | **Print de tela + upload no admin + OCR/IA** (substitui automação de conta, que violaria os Termos de Serviço do WhatsApp) | Decisão tomada em conversa: evita risco de ban de número |
| Cadastro manual | Formulário no painel admin | Fallback sempre disponível, também serve para correção manual |

## Requisitos não funcionais

- **Robusto e rápido**: milhares de acessos diários, então o catálogo de ofertas precisa ser
  servido com cache agressivo (ISR/edge), não bater no banco a cada request.
- **Leve e barato**: rodar dentro dos planos gratuitos de Vercel e Supabase o máximo de tempo
  possível.
- **Genérico**: o schema de produto usa atributos flexíveis (JSONB) por tipo de produto, para que
  "vinho" ou "livro" sejam apenas um novo `product_type` com seu próprio conjunto de atributos,
  sem migração estrutural.
- **Auditável**: toda oferta sabe de qual fonte/captura ela veio, para debug e para desconfiar de
  dados ruins (ex: OCR errado, scraper quebrado).

## Documentos relacionados

- [02-arquitetura.md](02-arquitetura.md) — stack técnica e desenho do sistema
- [03-modelo-dados.md](03-modelo-dados.md) — schema do banco
- [04-conectores-ingestao.md](04-conectores-ingestao.md) — como cada fonte de dados vira uma "oferta"
- [05-roadmap.md](05-roadmap.md) — ordem sugerida de construção
- [06-riscos-e-legal.md](06-riscos-e-legal.md) — riscos de scraping, ToS, e como mitigar
