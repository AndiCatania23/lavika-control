const STORAGE_KEY = 'lavika_run_source_registry';

type RunSourceMap = Record<string, string>;

function readRegistry(): RunSourceMap {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as RunSourceMap;
  } catch {
    return {};
  }
}

function writeRegistry(registry: RunSourceMap) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(registry));
  } catch {
    // ignore storage errors
  }
}

export function saveRunSourceMapping(runId: string, sourceId: string) {
  if (!runId || !sourceId) return;
  const registry = readRegistry();
  registry[runId] = sourceId;
  writeRegistry(registry);
}

export function getRunSourceMapping(runId: string): string | null {
  if (!runId) return null;
  const registry = readRegistry();
  return registry[runId] ?? null;
}
