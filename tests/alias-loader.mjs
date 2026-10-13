// Resolves the "@/..." path alias (defined for Next's bundler in jsconfig.json) when lib
// files are imported by a plain Node script outside Next -- e.g. this project's own test
// suite. Without this, every src/lib file's internal "@/lib/..." imports fail under `node`.
import { pathToFileURL } from "node:url";

const SRC_URL = pathToFileURL(new URL("../src/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const rest = specifier.slice(2);
    const target = new URL(rest.endsWith(".js") ? rest : `${rest}.js`, SRC_URL).href;
    return nextResolve(target, context);
  }
  return nextResolve(specifier, context);
}
