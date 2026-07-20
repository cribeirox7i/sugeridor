# Sugeridor — Hub de Ofertas (planejamento)

Hub de ofertas de cervejas artesanais e especiais, construído como engine genérica reutilizável
pra outros tipos de produto (vinho, livros, etc.) no futuro.

Este repositório por enquanto contém apenas o **planejamento** — código ainda não foi iniciado.

## Documentos

1. [Visão geral](docs/01-visao-geral.md)
2. [Arquitetura](docs/02-arquitetura.md)
3. [Modelo de dados](docs/03-modelo-dados.md)
4. [Conectores de ingestão](docs/04-conectores-ingestao.md)
5. [Roadmap](docs/05-roadmap.md)
6. [Riscos e legal](docs/06-riscos-e-legal.md)

## Stack (resumo)

Next.js + Vercel (site, admin, API) · Supabase (Postgres + Auth + Storage) · GitHub Actions
(scraping/email, disparado manualmente por um botão no admin) · Claude API (normalização de dados
não estruturados: HTML de e-mail, print de WhatsApp).

## Estado atual — Fase 0 concluída

O que já está pronto neste repositório:
- App Next.js em `web/` (TypeScript, Tailwind, App Router), rodando localmente com `npm run dev`.
- Cliente Supabase (browser/server/proxy) em `web/src/lib/supabase/`, seguindo `@supabase/ssr`.
- Login de admin (`/admin/login`) + rota protegida (`/admin`) via Supabase Auth.
- Migration inicial do schema em `supabase/migrations/0001_init.sql` (todas as tabelas de
  [docs/03-modelo-dados.md](docs/03-modelo-dados.md), com RLS habilitado e leitura pública do
  catálogo).
- `web/.env.local.example` documentando as variáveis necessárias.
- Repositório git inicializado localmente (ainda sem nenhum commit).

### O que só você pode fazer (precisa da sua conta)

1. **Criar o projeto Supabase**: pelo [dashboard](https://supabase.com/dashboard) ou via
   `npx supabase login` + `npx supabase projects create`. Depois, copie a URL e as chaves em
   Project Settings > API pro `web/.env.local` (baseado no `.env.local.example`).
2. **Aplicar a migration**: `npx supabase link --project-ref <ref>` e depois
   `npx supabase db push` (ou cole o SQL de `supabase/migrations/0001_init.sql` direto no SQL
   Editor do dashboard).
3. **Criar seu usuário admin**: no dashboard do Supabase, em Authentication > Users, criar um
   usuário com e-mail/senha (é com ele que você loga em `/admin/login`).
4. **Criar o repositório no GitHub** e dar push neste código (necessário pro GitHub Actions do
   scraping e pro deploy via Vercel).
5. **Conectar no Vercel**: importar o repositório, definir "Root Directory" = `web`, e colar as
   mesmas variáveis de ambiente do `.env.local` nas configurações do projeto.

Depois desses passos, a Fase 1 (catálogo público + CRUD manual no admin) pode começar.
