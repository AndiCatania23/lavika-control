export type DatasetStatus = 'fresh' | 'stale' | 'partial' | 'unavailable' | 'error';

export interface DatasetFreshness {
  status: DatasetStatus;
  source: string;
  updatedAt: string | null;
  ageMinutes: number | null;
  message?: string;
}

export function datasetFreshness(args: {
  source: string;
  updatedAt: string | null;
  staleAfterMinutes: number;
  now?: Date;
  partial?: boolean;
  unavailable?: boolean;
  error?: string | null;
}): DatasetFreshness {
  const { source, updatedAt, staleAfterMinutes, partial = false, unavailable = false, error = null } = args;
  if (error) return { status: 'error', source, updatedAt, ageMinutes: null, message: error };
  if (unavailable || !updatedAt) return { status: 'unavailable', source, updatedAt: null, ageMinutes: null };

  const now = args.now ?? new Date();
  const parsed = new Date(updatedAt);
  if (Number.isNaN(parsed.getTime())) {
    return { status: 'error', source, updatedAt, ageMinutes: null, message: 'Timestamp non valido' };
  }
  const ageMinutes = Math.max(0, Math.floor((now.getTime() - parsed.getTime()) / 60_000));
  if (partial) return { status: 'partial', source, updatedAt, ageMinutes };
  return {
    status: ageMinutes > staleAfterMinutes ? 'stale' : 'fresh',
    source,
    updatedAt,
    ageMinutes,
  };
}
