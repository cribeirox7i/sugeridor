# Riscos e Cuidados Legais

## Scraping de sites

- **Verificar `robots.txt` e Termos de Serviço de cada loja** antes de cadastrá-la como fonte.
  Alguns e-commerces proíbem scraping explicitamente nos ToS, mesmo que o `robots.txt` não bloqueie.
- **Rate limiting educado**: intervalo entre requests, não bater agressivo num mesmo site (risco de
  bloqueio de IP e de sobrecarregar o site alheio).
- **User-Agent identificável** (não fingir ser navegador comum) é mais eticamente correto, mas
  aumenta a chance de bloqueio — decisão sua caso a caso por loja.
- **Risco de bloqueio/mudança de layout**: scraper vai quebrar eventualmente; o log em
  `ingestion_jobs` é o que avisa isso. **Já aconteceu na prática** (2026-07-26): duas lojas
  passaram a responder 403 Forbidden só quando a requisição vinha do runner do GitHub Actions —
  o mesmo request, feito de outra rede, respondia 200 normalmente. É bloqueio pelo IP do runner
  (datacenter, comum alvo de WAF/anti-bot), não algo que o código controla. **Decisão**: não
  contornar isso trocando User-Agent pra fingir navegador nem qualquer outra evasão — o coletor só
  registra a falha (por loja, sem derrubar as outras) e segue. Se uma loja específica passar a
  falhar sempre, é sinal de conversar com ela sobre acesso, não de mascarar o coletor.
- Exibir preço e link de um produto, com atribuição clara da loja de origem e sem republicar
  conteúdo protegido (descrições longas, fotos autorais em alta resolução) reduz risco de disputa
  — o foco do hub é a oferta (preço + link), não republicar o catálogo da loja.

## WhatsApp

- A decisão tomada (print + upload manual + OCR/IA) evita o principal risco, que seria automatizar
  login numa conta pessoal via biblioteca não-oficial (ex: whatsapp-web.js), o que viola os Termos
  de Serviço do WhatsApp e pode banir o número. Como o fluxo aqui é 100% manual (você decide o que
  sobe), não há automação de conta — risco praticamente eliminado.

## E-mail

- Usar uma caixa dedicada (não sua conta pessoal principal) pra isso, tanto por organização quanto
  por segurança de credenciais (a senha/token de app fica só nesse serviço).

## Dados pessoais / privacidade

- O sistema não deve armazenar dados pessoais de terceiros (ex: números de telefone visíveis num
  print de grupo do WhatsApp) além do necessário pra extrair a oferta. Vale instruir o normalizador
  (prompt da IA) a ignorar/mascarar qualquer dado pessoal que apareça incidentalmente no print.

## Afiliados (futuro)

- Programas de afiliados costumam exigir divulgação clara ("este link é um link de afiliado") —
  ao ativar, adicionar aviso visível no rodapé/página, não só nos links individuais.
