/**
 * Lets plain Node run the app's TypeScript modules outside Next.js: maps the
 * "@/" alias to src/ and resolves extensionless imports the way the bundler
 * does (./presets -> ./presets.ts, ./authz -> ./authz/index.ts). Loaded with
 * `node --import` before the worker starts; no build step or extra dependency.
 *
 * `server-only` resolves to an empty module here: the worker is server code
 * by definition. (Running Node with the react-server condition would do the
 * same, but it breaks @react-pdf/renderer, which needs the regular React.)
 */
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

const srcUrl = pathToFileURL(`${process.cwd()}/src/`).href;
const candidates = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];
const emptyModule = "data:text/javascript,export {};";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: emptyModule, shortCircuit: true };
    const target = specifier.startsWith("@/") ? srcUrl + specifier.slice(2) : specifier;
    const local =
      target !== specifier || specifier.startsWith(".") || specifier.startsWith("file:");
    if (!local) return nextResolve(specifier, context);

    let firstError: unknown;
    for (const suffix of candidates) {
      try {
        return nextResolve(target + suffix, context);
      } catch (error) {
        firstError ??= error;
      }
    }
    throw firstError;
  },
});
