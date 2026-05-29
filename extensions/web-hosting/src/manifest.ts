export interface SiteFile {
  path: string;
  content: Uint8Array;
}

export function normalizePath(path: string): string {
  let p = path.replace(/\\/g, '/');
  if (!p.startsWith('/')) p = '/' + p;
  return p.replace(/\/{2,}/g, '/');
}

export function resolveIndex(requestPath: string): string {
  const p = normalizePath(requestPath);
  if (p.endsWith('/')) return p + 'index.html';
  return p;
}
