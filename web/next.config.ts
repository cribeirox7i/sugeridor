import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_SHA: process.env.GITHUB_SHA?.slice(0, 7) ?? "dev",
    NEXT_PUBLIC_BUILD_NUMBER: process.env.GITHUB_RUN_NUMBER ?? "",
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
};

export default withNextIntl(nextConfig);
