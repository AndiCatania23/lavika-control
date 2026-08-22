export type MetaMetricSeries = {
  data?: Array<{
    name: string;
    values?: Array<{ value: unknown }>;
  }>;
};

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Mantiene la differenza semantica tra una metrica assente e uno zero reale. */
export function firstMetricValue(series: MetaMetricSeries, name: string): number | null {
  const value = series.data?.find((item) => item.name === name)?.values?.[0]?.value;
  return finiteNumber(value);
}

/** Somma una serie giornaliera solo quando Meta ha restituito almeno un valore valido. */
export function sumMetricValues(series: MetaMetricSeries, name: string): number | null {
  const values = series.data?.find((item) => item.name === name)?.values;
  if (!values?.length) return null;
  const numeric = values.map((item) => finiteNumber(item.value)).filter((item): item is number => item != null);
  if (numeric.length === 0) return null;
  return numeric.reduce((sum, value) => sum + value, 0);
}

export function firstAvailableMetric(...values: Array<number | null>): number | null {
  return values.find((value) => value != null) ?? null;
}

export function engagementRate(interactions: number | null, reach: number | null): number | null {
  if (interactions == null || reach == null || reach <= 0) return null;
  return Math.min(interactions / reach, 9.9999);
}

export function sumKnownMetrics(values: Array<number | null>): number | null {
  const known = values.filter((value): value is number => value != null);
  return known.length > 0 ? known.reduce((sum, value) => sum + value, 0) : null;
}

export function pipelineStatus(errors: string[]): 'success' | 'partial' {
  return errors.length > 0 ? 'partial' : 'success';
}
