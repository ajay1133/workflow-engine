export function getByDotPath(obj: unknown, path: string): unknown {
  if (!path) return null;
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[part];
  }
  return current ?? null;
}

export function setByDotPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const isLast = i === parts.length - 1;
    if (isLast) {
      current[part] = value;
      return;
    }
    const next = current[part];
    if (next == null || typeof next !== 'object' || Array.isArray(next)) {
      current[part] = {} as Record<string, unknown>;
    }
    current = current[part] as Record<string, unknown>;
  }
}

export function pickDotPaths(ctx: Record<string, unknown>, paths: string[]): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const path of paths) {
    const value = getByDotPath(ctx, path);
    if (value !== null && value !== undefined) {
      setByDotPath(next, path, value);
    }
  }
  return next;
}
