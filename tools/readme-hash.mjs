#!/usr/bin/env node
/**
 * Escribe en README.md la huella SHA-256 actual de la descarga (que es la del archivo de la app tal cual),
 * entre las marcas <!-- sha256:inicio --> y <!-- sha256:fin -->.
 * Lo corre `npm run release`; no hace falta usarlo suelto.
 *
 * Uso: node tools/readme-hash.mjs [--source ruta.html]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256Hex, formatKb, readmeHashBlock, README_MARKS } from "./lib.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const SOURCE = resolve(ROOT, opt("--source", "source/famsurvivor_standalone.html"));
const README = join(ROOT, "README.md");

if (!existsSync(SOURCE) || !existsSync(README)) {
  console.error("\nERROR: faltan source/famsurvivor_standalone.html o README.md\n");
  process.exit(1);
}

const config = JSON.parse(readFileSync(join(ROOT, "site.config.json"), "utf8"));
const bytes = readFileSync(SOURCE);
const block = readmeHashBlock({
  downloadName: config.downloadName,
  hash: sha256Hex(bytes),
  appVersion: config.appVersion,
  size: formatKb(bytes.length),
});

const text = readFileSync(README, "utf8");
const start = text.indexOf(README_MARKS[0]);
const end = text.indexOf(README_MARKS[1]);
if (start < 0 || end < start) {
  console.error(`\nERROR: README.md no tiene las marcas ${README_MARKS.join(" y ")}. Agregalas donde quieras mostrar la huella.\n`);
  process.exit(1);
}
const next = text.slice(0, start) + block + text.slice(end + README_MARKS[1].length);
if (next === text) {
  console.log("OK  README.md ya muestra la huella actual.");
} else {
  writeFileSync(README, next);
  console.log(`OK  README.md actualizado: ${sha256Hex(bytes)}  ${config.downloadName}`);
}
