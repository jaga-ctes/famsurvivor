#!/usr/bin/env node
/**
 * Sella la CSP del archivo de la app: recalcula los hashes de script-src y style-src
 * a partir del <script> y el <style> en línea, y los escribe en la etiqueta <meta>.
 *
 * Correlo cada vez que edites a mano el <script> o el <style> de source/famsurvivor_standalone.html.
 * Si no lo hacés, el navegador bloquea el bloque editado entero (la app se ve sin estilos o en blanco)
 * y el build se detiene para que no se publique roto.
 *
 * Uso: npm run seal            (o: node tools/seal.mjs --source ruta.html)
 *      node tools/seal.mjs --check   solo informa, no escribe (sale con 1 si hay que sellar)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { sealCsp, cspStatus } from "./lib.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const SOURCE = resolve(ROOT, opt("--source", "source/famsurvivor_standalone.html"));
const CHECK_ONLY = argv.includes("--check");
const shown = relative(ROOT, SOURCE) || SOURCE;

if (!existsSync(SOURCE)) {
  console.error(`\nERROR: no encuentro ${shown}\n`);
  process.exit(1);
}

const html = readFileSync(SOURCE, "utf8");
const status = cspStatus(html);
if (status.ok) {
  console.log(`OK  la CSP de ${shown} ya coincide con su <script> y su <style>. No hay nada que sellar.`);
  process.exit(0);
}
if (CHECK_ONLY) {
  console.error(`\nHay que sellar ${shown}:\n  - ${status.problems.join("\n  - ")}\nCorré: npm run seal\n`);
  process.exit(1);
}

let result;
try {
  result = sealCsp(html);
} catch (error) {
  console.error(`\nERROR: ${error.message}\n`);
  process.exit(1);
}
writeFileSync(SOURCE, result.html);
console.log(`Sellado ${shown}`);
for (const c of result.changes) console.log(`  ${c.directive}\n    antes:   ${c.before}\n    ahora:   ${c.after}`);
// Dentro de `npm run release` el build viene a continuación: el consejo solo sirve si se corrió `npm run seal` suelto.
if (process.env.npm_lifecycle_event !== "release") console.log("Ahora corré: npm run build");
