#!/usr/bin/env node
/**
 * Idiomas de la app: valida i18n/*.json y los incrusta en source/famsurvivor_standalone.html,
 * entre las marcas /*I18N*\/ y /*\/I18N*\/. Después hay que sellar la CSP (npm run release lo hace).
 *
 *   npm run i18n              valida e incrusta
 *   npm run i18n -- --check   solo valida (no escribe)
 *   npm run i18n -- --sync-es copia a i18n/es-AR.json el diccionario actual de la app
 *
 * Cómo está armado:
 *   - «d»: textos de la interfaz. El español sale del diccionario de la app (var dt={…}); cada idioma
 *     tiene que traer las mismas claves y los mismos marcadores {x}.
 *   - «c»: contenido (amenazas, pasos, pilares, fuentes…), traducido por texto: la clave es la frase en
 *     español tal como está en la app. La lista de referencia es i18n/es-AR.json → c. El autodiagnóstico
 *     de la app (?selftest) comprueba que no falte ninguna frase del contenido real.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "source/famsurvivor_standalone.html");
const LANGS = ["en", "pt-BR", "fr"];
const MARK_A = "/*I18N*/";
const MARK_B = "/*/I18N*/";
const args = new Set(process.argv.slice(2));
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const placeholders = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(",");
const errors = [];
const warnings = [];

let html = readFileSync(SOURCE, "utf8");
const dm = /var dt=(\{.*?\});var _a=/s.exec(html);
if (!dm) {
  console.error("No encuentro el diccionario de la app (var dt={…};var _a=). ¿Cambió la forma del archivo?");
  process.exit(1);
}
const dt = JSON.parse(dm[1]);
const es = JSON.parse(read("i18n/es-AR.json"));

if (args.has("--sync-es")) {
  es.d = dt;
  writeFileSync(join(ROOT, "i18n/es-AR.json"), JSON.stringify(es, null, 1) + "\n");
  console.log(`OK  i18n/es-AR.json actualizado con ${Object.keys(dt).length} textos de la app.`);
}

// el español de referencia tiene que coincidir con la app
for (const k of Object.keys(dt)) {
  if (!(k in es.d)) warnings.push(`es-AR.json no tiene «${k}» (texto nuevo en la app): corré npm run i18n -- --sync-es y traducilo.`);
  else if (es.d[k] !== dt[k]) warnings.push(`El texto «${k}» cambió en la app: revisá sus traducciones y corré --sync-es.`);
}

const packs = {};
for (const code of LANGS) {
  let p;
  try {
    p = JSON.parse(read(`i18n/${code}.json`));
  } catch (e) {
    errors.push(`i18n/${code}.json: ${e.message}`);
    continue;
  }
  for (const k of Object.keys(dt)) {
    const v = p.d?.[k];
    if (typeof v !== "string" || !v.trim()) errors.push(`${code}: falta el texto «${k}»`);
    else if (placeholders(v) !== placeholders(dt[k])) errors.push(`${code}: «${k}» tiene marcadores distintos (${placeholders(v)} ≠ ${placeholders(dt[k])})`);
  }
  for (const k of Object.keys(p.d || {})) if (!(k in dt)) warnings.push(`${code}: «${k}» ya no existe en la app (se ignora)`);
  for (const s of es.c) {
    const v = p.c?.[s];
    if (typeof v !== "string" || !v.trim()) errors.push(`${code}: falta la traducción de «${s.slice(0, 70)}»`);
  }
  // solo lo que la app usa
  const d = Object.fromEntries(Object.keys(dt).filter((k) => typeof p.d?.[k] === "string").map((k) => [k, p.d[k]]));
  const c = Object.fromEntries(es.c.filter((s) => typeof p.c?.[s] === "string").map((s) => [s, p.c[s]]));
  packs[code] = { locale: p.locale || code, name: p.name || code, d, c };
}

for (const w of warnings) console.warn(`  ⚠ ${w}`);
if (errors.length) {
  console.error(`\n${errors.length} problema(s) en los idiomas:\n  - ${errors.slice(0, 40).join("\n  - ")}${errors.length > 40 ? "\n  - …" : ""}\n`);
  process.exit(1);
}
const summary = LANGS.map((c) => `${c} (${Object.keys(packs[c].d).length} + ${Object.keys(packs[c].c).length})`).join(", ");
if (args.has("--check")) {
  console.log(`OK  idiomas completos: ${summary}`);
  process.exit(0);
}

const a = html.indexOf(MARK_A);
const b = html.indexOf(MARK_B);
if (a < 0 || b < a || html.indexOf(MARK_A, a + 1) >= 0) {
  console.error(`No encuentro una sola marca ${MARK_A}…${MARK_B} en el archivo de la app.`);
  process.exit(1);
}
// Las claves (en español) van una sola vez: dk/ck; cada idioma trae sus textos en el mismo orden.
// La app rearma los mapas al arrancar.
const dk = Object.keys(dt);
const ck = es.c;
const compact = { dk, ck };
for (const code of LANGS) compact[code] = { locale: packs[code].locale, d: dk.map((k) => packs[code].d[k]), c: ck.map((s) => packs[code].c[s]) };
// </ dentro de un <script> lo cerraría: se escribe <\/
const payload = JSON.stringify(compact).replace(/<\//g, "<\\/");
const next = html.slice(0, a + MARK_A.length) + payload + html.slice(b);
if (next === html) {
  console.log(`OK  los idiomas ya están incrustados y al día: ${summary}`);
} else {
  writeFileSync(SOURCE, next);
  console.log(`OK  idiomas incrustados en la app: ${summary} · ${Math.round(payload.length / 1024)} KB`);
}
