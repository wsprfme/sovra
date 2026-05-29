import { blake3 } from '@noble/hashes/blake3';
import { SovraError, type ErrorCode } from '@sovrasdk/contracts';

const CID_PREFIX = 'b3-';
const HEX_LEN = 64;

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, '0');
  }
  return out;
}

export function computeCid(content: Uint8Array): string {
  const digest = blake3(content);
  return CID_PREFIX + toHex(digest);
}

export function isValidCid(cid: string): boolean {
  if (!cid.startsWith(CID_PREFIX)) return false;
  const hex = cid.slice(CID_PREFIX.length);
  return hex.length === HEX_LEN && /^[0-9a-f]+$/.test(hex);
}

export function verifyContent(cid: string, content: Uint8Array): boolean {
  if (!isValidCid(cid)) return false;
  return computeCid(content) === cid;
}

export function assertContent(cid: string, content: Uint8Array): Uint8Array {
  if (!verifyContent(cid, content)) {
    throw new SovraError(
      'content_corrupted' satisfies ErrorCode,
      `content does not match CID ${cid}`,
      { detail: { cid } },
    );
  }
  return content;
}
