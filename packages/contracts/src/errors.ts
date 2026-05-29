import { z } from 'zod';

export const ERROR_CODES = [
  'unauthorized',
  'auth_locked',
  'quota_exceeded',
  'upload_incomplete',
  'content_corrupted',
  'not_found',
  'invalid_extension_manifest',
  'permission_denied',
  'extension_failure',
  'share_revoked',
  'share_expired',
  'domain_conflict',
  'cloudflare_unauthorized',
  'vps_auth_failed',
  'backup_version_unsupported',
  'rate_limited',
  'validation_error',
  'internal_error',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const RETRYABLE_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  'internal_error',
  'rate_limited',
]);

export const errorCodeSchema = z.enum(ERROR_CODES);

export const sovraErrorSchema = z.object({
  code: errorCodeSchema,
  message: z.string().min(1),
  ts: z.number().int().nonnegative(),
  detail: z.record(z.unknown()).optional(),
});

export type SovraErrorShape = z.infer<typeof sovraErrorSchema>;

export class SovraError extends Error {
  readonly code: ErrorCode;
  readonly ts: number;
  readonly detail?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    options?: { detail?: Record<string, unknown>; ts?: number; cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'SovraError';
    this.code = code;
    this.ts = options?.ts ?? Date.now();
    if (options?.detail) this.detail = options.detail;
    Object.setPrototypeOf(this, SovraError.prototype);
  }

  get retryable(): boolean {
    return RETRYABLE_CODES.has(this.code);
  }

  toJSON(): SovraErrorShape {
    return {
      code: this.code,
      message: this.message,
      ts: this.ts,
      ...(this.detail ? { detail: this.detail } : {}),
    };
  }

  static is(value: unknown): value is SovraError {
    return value instanceof SovraError;
  }

  static fromJSON(value: unknown): SovraError {
    const parsed = sovraErrorSchema.parse(value);
    return new SovraError(parsed.code, parsed.message, {
      ts: parsed.ts,
      detail: parsed.detail,
    });
  }
}

export function makeError(
  code: ErrorCode,
  message: string,
  detail?: Record<string, unknown>,
): SovraError {
  return new SovraError(code, message, detail ? { detail } : undefined);
}

export function isRetryableCode(code: ErrorCode): boolean {
  return RETRYABLE_CODES.has(code);
}
