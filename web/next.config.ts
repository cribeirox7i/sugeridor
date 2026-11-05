import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  env: {
    // O build de produção é feito pela integração Git da Vercel, não por uma
    // Action: lá GITHUB_SHA/GITHUB_RUN_NUMBER não existem. Por isso a Vercel
    // vem primeiro, com as vars do Actions como fallback caso algum dia o
    // deploy passe por workflow. Sem nenhuma das duas (dev local), fica "dev"
    // e o rodapé não mostra nada (ver BuildInfo.tsx).
    NEXT_PUBLIC_BUILD_SHA:
      (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA)?.slice(0, 7) ?? "dev",
    NEXT_PUBLIC_BUILD_NUMBER: process.env.GITHUB_RUN_NUMBER ?? "",
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
};

export default withNextIntl(nextConfig);
