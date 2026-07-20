import type { PriceHistoryPoint } from "@/lib/types";
import { formatPrice } from "@/lib/format";

// Gráfico de linha simples em SVG (sem lib externa). Recebe pontos ordenados por
// data e desenha a variação de preço.
export default function PriceHistoryChart({
  points,
  currency = "BRL",
}: {
  points: PriceHistoryPoint[];
  currency?: string;
}) {
  if (points.length < 2) {
    return (
      <p className="text-sm text-neutral-500">
        Ainda não há histórico suficiente para mostrar a variação de preço.
      </p>
    );
  }

  const W = 640;
  const H = 220;
  const pad = { top: 16, right: 16, bottom: 28, left: 56 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;

  const times = points.map((p) => new Date(p.captured_at).getTime());
  const prices = points.map((p) => p.price);
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const pMin = Math.min(...prices);
  const pMax = Math.max(...prices);
  // Evita divisão por zero quando todos os pontos têm o mesmo valor.
  const tSpan = tMax - tMin || 1;
  const pSpan = pMax - pMin || 1;

  const x = (t: number) => pad.left + ((t - tMin) / tSpan) * innerW;
  const y = (p: number) => pad.top + innerH - ((p - pMin) / pSpan) * innerH;

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(times[i]).toFixed(1)} ${y(p.price).toFixed(1)}`)
    .join(" ");

  const fmtDate = (t: number) =>
    new Date(t).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Histórico de preço">
      {/* eixo Y: min e max */}
      {[pMax, (pMax + pMin) / 2, pMin].map((val, i) => {
        const yy = y(val);
        return (
          <g key={i}>
            <line x1={pad.left} y1={yy} x2={W - pad.right} y2={yy} stroke="#262626" strokeWidth={1} />
            <text x={pad.left - 8} y={yy + 4} textAnchor="end" fontSize={11} fill="#737373">
              {formatPrice(val, currency)}
            </text>
          </g>
        );
      })}

      {/* eixo X: primeira e última data */}
      <text x={pad.left} y={H - 8} fontSize={11} fill="#737373">
        {fmtDate(tMin)}
      </text>
      <text x={W - pad.right} y={H - 8} textAnchor="end" fontSize={11} fill="#737373">
        {fmtDate(tMax)}
      </text>

      <path d={path} fill="none" stroke="#f59e0b" strokeWidth={2} />
      {points.map((p, i) => (
        <circle key={i} cx={x(times[i])} cy={y(p.price)} r={3} fill="#f59e0b" />
      ))}
    </svg>
  );
}
