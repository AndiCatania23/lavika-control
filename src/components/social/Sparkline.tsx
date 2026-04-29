/**
 * Sparkline — SVG inline custom, zero dipendenze.
 * Server Component (puro SVG, no client JS).
 *
 * Usato in /social/insights per crescita 30gg follower per platform.
 */

interface SparklineProps {
  values: Array<number | null | undefined>;
  width?: number;
  height?: number;
  stroke: string;
  fillOpacity?: number;
  /** Mostra dot finale (valore corrente) */
  showLastDot?: boolean;
  ariaLabel?: string;
}

export function Sparkline({
  values,
  width = 200,
  height = 48,
  stroke,
  fillOpacity = 0.12,
  showLastDot = true,
  ariaLabel = 'sparkline',
}: SparklineProps) {
  const numeric = values.map(v => (typeof v === 'number' && Number.isFinite(v) ? v : null));
  const validValues = numeric.filter((v): v is number => v !== null);

  if (validValues.length < 2) {
    return (
      <div
        style={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          color: 'var(--text-muted)',
        }}
        aria-label={ariaLabel}
      >
        Dati insufficienti
      </div>
    );
  }

  const min = Math.min(...validValues);
  const max = Math.max(...validValues);
  const range = max - min || 1;
  const padY = 4;
  const usableH = height - padY * 2;
  const stepX = numeric.length > 1 ? width / (numeric.length - 1) : 0;

  const points = numeric.map((v, i) => {
    if (v === null) return null;
    const x = i * stepX;
    const y = padY + usableH - ((v - min) / range) * usableH;
    return { x, y };
  });

  // Costruisce path solo sui punti validi (skipping null, splittando se serve)
  let d = '';
  let started = false;
  for (const p of points) {
    if (p === null) {
      started = false;
      continue;
    }
    d += started ? `L${p.x.toFixed(1)},${p.y.toFixed(1)}` : `M${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    started = true;
  }

  // Area sotto la curva
  const firstValid = points.find(p => p !== null);
  const lastValid = [...points].reverse().find(p => p !== null);
  const areaD = firstValid && lastValid
    ? `${d} L${lastValid.x.toFixed(1)},${height} L${firstValid.x.toFixed(1)},${height} Z`
    : '';

  const last = lastValid;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel}
      style={{ display: 'block', maxWidth: '100%' }}
    >
      {areaD && <path d={areaD} fill={stroke} fillOpacity={fillOpacity} />}
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {showLastDot && last && (
        <circle cx={last.x} cy={last.y} r={2.5} fill={stroke} />
      )}
    </svg>
  );
}
