import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const LIB_URL = pathToFileURL(path.join(ROOT, 'lib')).href;
const isFile = (p) => existsSync(p) && statSync(p).isFile();

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    const base = path.join(ROOT, specifier.slice(2));
    const match = [base, `${base}.js`, path.join(base, 'index.js')].find(isFile);
    if (match) return { url: pathToFileURL(match).href, shortCircuit: true };
  }
  return next(specifier, context);
}

// App source under lib/ is ESM syntax in .js files without "type": "module".
export async function load(url, context, next) {
  if (url.startsWith(LIB_URL) && url.endsWith('.js')) {
    return next(url, { ...context, format: 'module' });
  }
  return next(url, context);
}
