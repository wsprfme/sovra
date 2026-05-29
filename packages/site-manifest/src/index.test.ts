import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  parseManifest,
  printManifest,
  manifestsEqual,
  SiteManifestParseError,
  type SiteManifest,
} from './index.js';

const cidArb = fc
  .hexaString({ minLength: 64, maxLength: 64 })
  .map((h) => 'b3-' + h.padEnd(64, '0').slice(0, 64));

const pathArb = fc
  .array(fc.constantFrom('a', 'b', 'c', 'index', 'css', 'js', 'img'), {
    minLength: 1,
    maxLength: 4,
  })
  .map((segs) => '/' + segs.join('/'));

const manifestArb: fc.Arbitrary<SiteManifest> = fc
  .record({
    version: fc.integer({ min: 1, max: 100000 }),
    domain: fc.option(fc.constantFrom('example.com', 'my.site.io', 'a-b.co'), { nil: null }),
    timestamp: fc.integer({ min: 0, max: 2_000_000_000 }),
    entries: fc.uniqueArray(fc.tuple(pathArb, cidArb), {
      selector: (t) => t[0],
      maxLength: 8,
    }),
  })
  .map((r) => ({
    version: r.version,
    domain: r.domain,
    timestamp: r.timestamp,
    entries: r.entries.map(([path, cid]) => ({ path, cid })),
  }));

describe('Site_Manifest parser/printer', () => {
  it('property: parse(print(m)) equals m', () => {
    fc.assert(
      fc.property(manifestArb, (m) => {
        expect(manifestsEqual(parseManifest(printManifest(m)), m)).toBe(true);
      }),
    );
  });

  it('property: print(parse(s)) equals s', () => {
    fc.assert(
      fc.property(manifestArb, (m) => {
        const s = printManifest(m);
        expect(printManifest(parseManifest(s))).toBe(s);
      }),
    );
  });

  it('reports line and column on malformed input', () => {
    try {
      parseManifest('manifest 1\ndomain -\ntime 0\nbadpath b3-' + 'a'.repeat(64) + '\n');
      expect.unreachable('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(SiteManifestParseError);
      const err = e as SiteManifestParseError;
      expect(err.line).toBe(4);
      expect(err.column).toBe(1);
    }
  });

  it('rejects invalid CID with column position', () => {
    try {
      parseManifest('manifest 1\ndomain -\ntime 0\n/index.html not-a-cid\n');
      expect.unreachable('should throw');
    } catch (e) {
      const err = e as SiteManifestParseError;
      expect(err.line).toBe(4);
      expect(err.column).toBeGreaterThan(1);
    }
  });

  it('rejects missing headers', () => {
    expect(() => parseManifest('manifest 1\n')).toThrow(SiteManifestParseError);
  });
});
