import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, cpSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const extDir = join(root, 'extensions');
const outDir = join(root, 'dist-extensions');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const manifestById = new Map();

for (const id of readdirSync(extDir)) {
  const pkgPath = join(extDir, id, 'package.json');
  if (!existsSync(pkgPath)) continue;
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const distPath = join(extDir, id, 'dist');
  if (!existsSync(distPath)) {
    throw new Error(`extension ${id} is not built; run "pnpm build" first`);
  }

  const stageDir = join(outDir, `stage-${id}`);
  mkdirSync(stageDir, { recursive: true });
  cpSync(distPath, join(stageDir, 'dist'), { recursive: true });
  cpSync(pkgPath, join(stageDir, 'package.json'));

  const archive = join(outDir, `sovra-ext-${id}-${pkg.version}.tgz`);
  execFileSync('tar', ['-czf', archive, '-C', stageDir, '.'], { stdio: 'inherit' });
  rmSync(stageDir, { recursive: true, force: true });

  manifestById.set(id, { id, name: pkg.name, version: pkg.version, archive: `sovra-ext-${id}-${pkg.version}.tgz` });
  process.stdout.write(`packaged ${id} -> ${archive}\n`);
}

const catalog = {
  version: 1,
  generatedAt: new Date().toISOString(),
  extensions: [...manifestById.values()],
};
writeFileSync(join(outDir, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
process.stdout.write(`wrote ${join(outDir, 'catalog.json')}\n`);
