import { ed25519 } from '@noble/curves/ed25519';

export function verifySignature(
  pubkeyHex: string,
  message: Uint8Array,
  signatureHex: string,
): boolean {
  try {
    return ed25519.verify(hexToBytes(signatureHex), message, hexToBytes(pubkeyHex));
  } catch {
    return false;
  }
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('invalid hex');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
