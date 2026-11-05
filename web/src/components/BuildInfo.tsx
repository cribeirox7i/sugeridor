function formatBuildTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function BuildInfo({ className }: { className?: string }) {
  const sha = process.env.NEXT_PUBLIC_BUILD_SHA ?? "dev";
  const num = process.env.NEXT_PUBLIC_BUILD_NUMBER;
  const time = process.env.NEXT_PUBLIC_BUILD_TIME;

  if (sha === "dev") return null;

  const label = num ? `build #${num} · ${sha}` : sha;
  const dateStr = time ? formatBuildTime(time) : null;

  return (
    <p className={className ?? "mt-1 text-neutral-600"}>
      {label}
      {dateStr && ` · ${dateStr}`}
    </p>
  );
}
