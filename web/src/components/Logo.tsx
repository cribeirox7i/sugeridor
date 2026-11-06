import type { SiteSettings } from "@/lib/types";

// Troca de logo por CSS puro (dark:/light:), sem JS — evita flicker de
// hidratação. Se não houver logo cadastrada (ou a migration 0004 ainda não
// rodou), usa as logos estáticas em /public. Ordem de prioridade: banco > static.
const STATIC_LOGO_LIGHT = "/logo-light.jpg";
const STATIC_LOGO_DARK = "/logo-dark.webp";

export default function Logo({
  settings,
  fallbackText,
  className,
}: {
  settings: SiteSettings | null;
  fallbackText: string;
  className?: string;
}) {
  const lightSrc = settings?.logo_black_url ?? STATIC_LOGO_LIGHT;
  const darkSrc = settings?.logo_white_url ?? STATIC_LOGO_DARK;

  return (
    <span className="inline-flex items-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={lightSrc}
        alt={fallbackText}
        className={`${className ?? "h-8"} dark:hidden`}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={darkSrc}
        alt={fallbackText}
        className={`${className ?? "h-8"} hidden dark:block`}
      />
    </span>
  );
}
