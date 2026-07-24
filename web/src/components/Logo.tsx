import type { SiteSettings } from "@/lib/types";

// Troca de logo por CSS puro (dark:/light:), sem JS — evita flicker de
// hidratação. Se não houver logo cadastrada (ou a migration 0004 ainda não
// rodou), cai no texto da marca.
export default function Logo({
  settings,
  fallbackText,
  className,
}: {
  settings: SiteSettings | null;
  fallbackText: string;
  className?: string;
}) {
  const hasLogo = settings?.logo_black_url || settings?.logo_white_url;

  if (!hasLogo) {
    return <span className={className ?? "text-2xl font-semibold"}>{fallbackText}</span>;
  }

  return (
    <span className="inline-flex items-center">
      {settings?.logo_black_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={settings.logo_black_url}
          alt={fallbackText}
          className={`${className ?? "h-8"} dark:hidden`}
        />
      )}
      {settings?.logo_white_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={settings.logo_white_url}
          alt={fallbackText}
          className={`${className ?? "h-8"} hidden dark:block`}
        />
      )}
    </span>
  );
}
