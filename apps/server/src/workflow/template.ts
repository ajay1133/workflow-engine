import { getByDotPath } from './dotPath';

export function renderTemplate(template: string, ctx: unknown): string {
  return template.replace(/{{\s*([^}]+?)\s*}}/g, (_match, rawPath: string) => {
    const value = getByDotPath(ctx, rawPath);
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  });
}

export function deepTemplate<T>(value: T, ctx: unknown): T {
  if (typeof value === 'string') {
    return renderTemplate(value, ctx) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => deepTemplate(v, ctx)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = deepTemplate(v, ctx);
    }
    return out as unknown as T;
  }
  return value;
}
