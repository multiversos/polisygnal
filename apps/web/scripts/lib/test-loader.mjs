import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TextDecoder, TextEncoder } from "node:util";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const __dirname = dirname(fileURLToPath(import.meta.url));
export const appRoot = resolve(__dirname, "../..");
const moduleCache = new Map();

export function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function loadTsModule(relativePath) {
  const absolutePath = resolve(appRoot, relativePath);
  if (moduleCache.has(absolutePath)) {
    return moduleCache.get(absolutePath).exports;
  }
  const source = readFileSync(absolutePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: absolutePath,
  }).outputText;
  const module = { exports: {} };
  moduleCache.set(absolutePath, module);
  const localRequire = (specifier) => {
    if (specifier.startsWith(".")) {
      const resolvedBase = resolve(dirname(absolutePath), specifier);
      const candidates = [
        resolvedBase,
        `${resolvedBase}.ts`,
        `${resolvedBase}.tsx`,
        `${resolvedBase}.js`,
        `${resolvedBase}.mjs`,
      ];
      const found = candidates.find((candidate) => existsSync(candidate));
      if (found?.endsWith(".ts") || found?.endsWith(".tsx")) {
        return loadTsModule(found);
      }
      if (found) {
        return require(found);
      }
    }
    return require(specifier);
  };
  const context = vm.createContext({
    AbortController,
    clearTimeout,
    console,
    exports: module.exports,
    fetch: (...args) => globalThis.fetch(...args),
    Headers,
    module,
    process,
    Request,
    require: localRequire,
    Response,
    setTimeout,
    TextDecoder,
    TextEncoder,
    URL,
    URLSearchParams,
  });
  new vm.Script(compiled, { filename: absolutePath }).runInContext(context);
  return module.exports;
}
