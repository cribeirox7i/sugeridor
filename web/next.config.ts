import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const CSP = [
  "default-src 'self'",
  // Next.js App Router injeta scripts inline na hidratação — unsafe-inline
  // é necessário até que o app implemente nonces. frame-ancestors e
  // form-action permanecem úteis mesmo com unsafe-inline.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  // Imagens de produtos vêm de domínios externos (lojas).
  "img-src 'self' data: https:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  env: {
    // O build de produção é feito pela integração Git da Vercel, não por uma
    // Action: lá GITHUB_SHA não existe. Por isso a Vercel vem primeiro, com a
    // var do Actions como fallback caso algum dia o deploy passe por workflow.
    // Sem nenhuma das duas (dev local), fica "dev" e o rodapé não mostra nada
    // (ver BuildInfo.tsx).
    NEXT_PUBLIC_BUILD_SHA:
      (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA)?.slice(0, 7) ?? "dev",
    // Só a data (sem hora) no bundle público — reduz precisão de fingerprinting.
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString().slice(0, 10),
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
