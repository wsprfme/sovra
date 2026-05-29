import { isValidCid } from '@sovrasdk/cid';
import { SovraError } from '@sovrasdk/contracts';

export interface SiteManifestEntry {
  path: string;
  cid: string;
}

export interface SiteManifest {
  version: number;
  domain: string | null;
  timestamp: number;
  entries: SiteManifestEntry[];
}

export class SiteManifestParseError extends SovraError {
  readonly line: number;
  readonly column: number;

  constructor(message: string, line: number, column: number) {
    super('validation_error', `${message} (line ${line}, column ${column})`, {
      detail: { line, column },
    });
    this.name = 'SiteManifestParseError';
    this.line = line;
    this.column = column;
    Object.setPrototypeOf(this, SiteManifestParseError.prototype);
  }
}

function sortEntries(entries: SiteManifestEntry[]): SiteManifestEntry[] {
  return [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export function printManifest(manifest: SiteManifest): string {
  const lines: string[] = [];
  lines.push(`manifest ${manifest.version}`);
  lines.push(`domain ${manifest.domain ?? '-'}`);
  lines.push(`time ${manifest.timestamp}`);
  for (const entry of sortEntries(manifest.entries)) {
    lines.push(`${entry.path} ${entry.cid}`);
  }
  return lines.join('\n') + '\n';
}

function expectHeader(
  rawLines: string[],
  index: number,
  keyword: string,
): { value: string; column: number } {
  const line = rawLines[index];
  if (line === undefined) {
    throw new SiteManifestParseError(`missing "${keyword}" header`, index + 1, 1);
  }
  const prefix = keyword + ' ';
  if (!line.startsWith(prefix)) {
    throw new SiteManifestParseError(`expected "${keyword}" header`, index + 1, 1);
  }
  return { value: line.slice(prefix.length), column: prefix.length + 1 };
}

export function parseManifest(input: string): SiteManifest {
  const withoutTrailing = input.endsWith('\n') ? input.slice(0, -1) : input;
  const rawLines = withoutTrailing.split('\n');

  const versionHeader = expectHeader(rawLines, 0, 'manifest');
  const version = Number(versionHeader.value);
  if (!Number.isInteger(version) || version <= 0) {
    throw new SiteManifestParseError('version must be a positive integer', 1, versionHeader.column);
  }

  const domainHeader = expectHeader(rawLines, 1, 'domain');
  const domain = domainHeader.value === '-' ? null : domainHeader.value;
  if (domain !== null && !/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(domain)) {
    throw new SiteManifestParseError('invalid domain', 2, domainHeader.column);
  }

  const timeHeader = expectHeader(rawLines, 2, 'time');
  const timestamp = Number(timeHeader.value);
  if (!Number.isInteger(timestamp) || timestamp < 0) {
    throw new SiteManifestParseError('time must be a non-negative integer', 3, timeHeader.column);
  }

  const entries: SiteManifestEntry[] = [];
  const seenPaths = new Set<string>();
  for (let i = 3; i < rawLines.length; i++) {
    const lineNo = i + 1;
    const line = rawLines[i]!;
    if (line.length === 0) {
      throw new SiteManifestParseError('unexpected empty line', lineNo, 1);
    }
    const sep = line.indexOf(' ');
    if (sep === -1) {
      throw new SiteManifestParseError('entry must be "<path> <cid>"', lineNo, line.length + 1);
    }
    const path = line.slice(0, sep);
    const cid = line.slice(sep + 1);
    if (!path.startsWith('/')) {
      throw new SiteManifestParseError('entry path must start with "/"', lineNo, 1);
    }
    if (!isValidCid(cid)) {
      throw new SiteManifestParseError('invalid CID in entry', lineNo, sep + 2);
    }
    if (seenPaths.has(path)) {
      throw new SiteManifestParseError(`duplicate path "${path}"`, lineNo, 1);
    }
    seenPaths.add(path);
    entries.push({ path, cid });
  }

  return { version, domain, timestamp, entries: sortEntries(entries) };
}

export function manifestsEqual(a: SiteManifest, b: SiteManifest): boolean {
  if (a.version !== b.version || a.domain !== b.domain || a.timestamp !== b.timestamp) {
    return false;
  }
  const ea = sortEntries(a.entries);
  const eb = sortEntries(b.entries);
  if (ea.length !== eb.length) return false;
  for (let i = 0; i < ea.length; i++) {
    if (ea[i]!.path !== eb[i]!.path || ea[i]!.cid !== eb[i]!.cid) return false;
  }
  return true;
}
