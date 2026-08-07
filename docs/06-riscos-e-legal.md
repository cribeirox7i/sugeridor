# Riscos e Cuidados Legais

## Scraping de sites

- **Verificar `robots.txt` e Termos de Serviço de cada loja** antes de cadastrá-la como fonte.
  Alguns e-commerces proíbem scraping explicitamente nos ToS, mesmo que o `robots.txt` não bloqueie.
- **Rate limiting educado**: intervalo entre requests, não bater agressivo num mesmo site (risco de
  bloqueio de IP e de sobrecarregar o site alheio).
- **User-Agent de navegador comum** (decisão revista em 2026-07-31 — antes era um UA identificável
  tipo `SugeridorBot/1.0 (+https://...)`). Motivo da mudança: a Faca Cervejaria bloqueava até a
  home com 403 só por causa da palavra "Bot" no header — um WAF genérico (AWS/CloudFront), não uma
  decisão específica da loja contra scraping (o `robots.txt` dela libera `Googlebot` e só nomeia
  crawlers agressivos conhecidos como bloqueados). O trade-off consciente: perde-se identificação
  fácil pro dono do site que quiser reclamar por e-mail, ganha-se acesso a lojas que bloqueariam por
  padrão de infraestrutura, não por objeção real. Continua valendo tudo o que já mitigava o resto do
  risco (rate limit por host, guard-rails de volume, não republicar conteúdo protegido) — só o
  header de identificação mudou.
- **Risco de bloqueio/mudança de layout**: scraper vai quebrar eventualmente; o log em
  `ingestion_jobs` é o que avisa isso. **Já aconteceu na prática** (2026-07-26): duas lojas
  passaram a responder 403 Forbidden só quando a requisição vinha do runner do GitHub Actions —
  o mesmo request, feito de outra rede, respondia 200 normalmente. É bloqueio pelo IP do runner
  (datacenter, comum alvo de WAF/anti-bot), não algo que o código controla — trocar User-Agent não
  ajuda nesse caso específico (é o IP, não o header). Se uma loja específica passar a falhar
  sempre mesmo com UA de navegador, é sinal de conversar com ela sobre acesso.
  **Terceira ocorrência** (2026-08-05): Invicta e Brejas, mesmo padrão (403 só do runner, 200 de
  IP comum — confirmado rodando `python -m scraper.run` local). Como o coletor não muda o
  resultado (`jsonld`/`html`/`txt` usam a mesma sessão HTTP, `scraper/http.py`, então o bloqueio
  acontece antes de qualquer parsing), a mitigação prática virou `scraper/run-local.ps1`: script
  que roda a coleta de uma loja específica (ou todas) direto da máquina do usuário, cujo IP não
  está na lista de bloqueio de datacenter. Não é automático — precisa ser disparado manualmente de
  vez em quando, mas evita depender só de aceitar a loja como perdida ou tirar da coleta.
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
