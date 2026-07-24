import type { PriceHistoryPoint } from "@/lib/types";

// Mini gráfico de linha, sem eixos/rótulos — visão rápida de tendência no
// card do catálogo. Recebe os pontos já carregados (ver getPriceHistoryForOffers
// em web/src/lib/queries.ts, buscados em lote na home pra evitar N+1).
export default function MiniSparkline({ points }: { points: PriceHistoryPoint[] }) {
  if (points.length < 2) return null;

  const W = 200;
  const H = 32;
  const pad = 3;

  const prices = points.map((p) => p.price);
  const pMin = Math.min(...prices);
  const pMax = Math.max(...prices);
  const pSpan = pMax - pMin || 1;

  const x = (i: number) => pad + (i / (points.length - 1)) * (W - pad * 2);
  const y = (price: number) => H - pad - ((price - pMin) / pSpan) * (H - pad * 2);

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.price).toFixed(1)}`)
    .join(" ");

  const trendingDown = prices[prices.length - 1] < prices[0];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-8 w-full"
      role="img"
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <path
        d={path}
        fill="none"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        className={trendingDown ? "stroke-green-500" : "stroke-neutral-400 dark:stroke-neutral-600"}
      />
    </svg>
  );
}
