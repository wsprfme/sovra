import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { SovraError } from '@sovrasdk/contracts';
import type { SecretsCapability } from '@sovrasdk/extension-api';

const IV_LEN = 12;

export function createSecrets(masterToken: string, extId: string): SecretsCapability {
  const key = createHash('sha256').update(`${masterToken}:${extId}`).digest();

  return {
    encrypt(plaintext: string): string {
      const iv = randomBytes(IV_LEN);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
    },
    decrypt(ciphertext: string): string {
      const [ivB64, tagB64, dataB64] = ciphertext.split(':');
      if (!ivB64 || !tagB64 || !dataB64) {
        throw new SovraError('validation_error', 'malformed secret');
      }
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
      decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(dataB64, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    },
  };
}
