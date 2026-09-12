import { cp, mkdir, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const source = resolve("node_modules/@open-wa/core/src/transport/assets");
const destinations = [
  resolve("assets"),
  resolve("node_modules/@open-wa/core/dist/transport/assets"),
];
const required = new Set([
  "qr.min.js",
  "hash.js",
  "init_patch.js",
  "prog_observer.js",
  "wapi.js",
  "launch.js",
]);

const available = new Set(await readdir(source));
const missing = [...required].filter((name) => !available.has(name));
if (missing.length) {
  throw new Error(`OpenWA runtime assets missing from package: ${missing.join(", ")}`);
}

for (const destination of destinations) {
  await mkdir(destination, { recursive: true });
  for (const name of required) {
    await cp(resolve(source, name), resolve(destination, name));
  }
}
