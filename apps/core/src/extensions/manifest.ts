import { extensionManifestSchema, SovraError, type ExtensionManifest } from '@sovra/contracts';

export function parseManifest(input: unknown): ExtensionManifest {
  const result = extensionManifestSchema.safeParse(input);
  if (!result.success) {
    throw new SovraError('invalid_extension_manifest', 'extension manifest is invalid', {
      detail: { issues: result.error.issues.map((i) => ({ path: i.path, message: i.message })) },
    });
  }
  return result.data;
}
