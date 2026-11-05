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
  const time = process.env.NEXT_PUBLIC_BUILD_TIME;

  // "dev" = build sem sha de commit (rodando local). Nesse caso não há build
  // identificável pra mostrar, então o rodapé fica sem a linha.
  if (sha === "dev") return null;

  const dateStr = time ? formatBuildTime(time) : null;

  return (
    <p className={className ?? "mt-1 text-neutral-600"}>
      {sha}
      {dateStr && ` · ${dateStr}`}
    </p>
  );
}
