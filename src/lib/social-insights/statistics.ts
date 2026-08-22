import type { ConfidenceLevel } from './types';

export function median(values: Array<number | null | undefined>): number | null {
  const sorted = values.filter((value): value is number => value != null && Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export function average(values: Array<number | null | undefined>): number | null {
  const known = values.filter((value): value is number => value != null && Number.isFinite(value));
  return known.length > 0 ? known.reduce((sum, value) => sum + value, 0) / known.length : null;
}

export function percentileRank(values: number[], value: number): number | null {
  if (values.length === 0) return null;
  const belowOrEqual = values.filter((item) => item <= value).length;
  return Math.round((belowOrEqual / values.length) * 1000) / 10;
}

export function confidenceForSample(sampleSize: number): ConfidenceLevel {
  if (sampleSize < 4) return 'insufficient';
  if (sampleSize < 8) return 'low';
  if (sampleSize < 20) return 'medium';
  return 'high';
}
