#!/usr/bin/env node
/**
 * Comprueba dist/ sin navegador. Si algo falla, el build de Vercel falla y NO se publica una versión rota.
 * Uso: node tests/check-dist.mjs [--source ruta.html] [--out dist]
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cspHash, cspStatus, inlineBlocks, readCsp, pngSize, sha256Hex, readmeHash } from "../tools/lib.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const OUT = resolve(ROOT, opt("--out", "dist"));
const SOURCE = resolve(ROOT, opt("--source", "source/famsurvivor_standalone.html"));
const config = JSON.parse(readFileSync(join(ROOT, "site.config.json"), "utf8"));

const read = (rel) => readFileSync(join(OUT, rel), "utf8");
const exists = (rel) => existsSync(join(OUT, rel));
/** "/app/" -> app/index.html, "/x.png" -> x.png */
const urlToFile = (url) => {
  const clean = url.split("#")[0].split("?")[0].replace(/^\//, "");
  if (clean === "" || clean.endsWith("/")) return clean + "index.html";
  return clean;
};

const failures = [];
const warnings = [];
let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (error) {
    failures.push(`${name}\n      ${error.message}`);
  }
}
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

// Los créditos son obligatorios en las tres piezas: la landing, la app instalable y la descarga.
const CREDIT_TEXT = "Diseñado por";
const CREDIT_URL = "https://jagasoluciones.com/";
const hasCredit = (html) => html.includes(CREDIT_TEXT) && html.includes(`href="${CREDIT_URL}"`);

// ---------- archivos
check("Existen los archivos del sitio", () => {
  for (const f of ["index.html", "landing.css", "landing.js", "app/index.html", "app/sw.js", "app/manifest.webmanifest", `descargas/${config.downloadName}`, "descargas/SHA256SUMS.txt"]) {
    assert(exists(f), `Falta dist/${f}`);
  }
});

// ---------- la app
const appHtml = exists("app/index.html") ? read("app/index.html") : "";
const downloadHtml = exists(`descargas/${config.downloadName}`) ? read(`descargas/${config.downloadName}`) : "";

check("La app ya no se declara «standalone» y trae el manifest", () => {
  assert(!appHtml.includes('data-build="standalone"'), 'Sigue con data-build="standalone": la app no registraría el Service Worker.');
  assert(appHtml.includes('data-build="pwa"'), 'Falta data-build="pwa".');
  assert(/<link rel="manifest" href="manifest\.webmanifest">/.test(appHtml), "Falta <link rel=manifest>.");
  assert((appHtml.match(/<link rel="apple-touch-icon"/g) || []).length === 1 && /<link rel="apple-touch-icon" href="\/icons\/apple-touch-icon\.png">/.test(appHtml), "Tiene que haber un único apple-touch-icon, en PNG.");
  assert((appHtml.match(/<link rel="manifest"/g) || []).length === 1, "Tiene que haber un único <link rel=manifest>.");
  assert(/<meta name="theme-color"/.test(appHtml), "Se perdió <meta name=theme-color>.");
  assert(!/\$[1-9&]/.test(appHtml.split("<script")[0]), "Quedó un marcador de reemplazo ($1…) en la cabecera de la app.");
});

check("CSP de la app: permite manifest y worker, sigue cerrada a internet", () => {
  const csp = readCsp(appHtml);
  assert(csp, "No hay CSP.");
  assert(csp.get("default-src")?.join(" ") === "'none'", "default-src dejó de ser 'none'.");
  const connect = csp.get("connect-src");
  assert(connect ? connect.join(" ") === "'none'" : true, "connect-src dejó de ser 'none': la app podría hablar con servidores.");
  assert(csp.get("manifest-src")?.includes("'self'"), "Falta manifest-src 'self'.");
  assert(csp.get("worker-src")?.includes("'self'"), "Falta worker-src 'self'.");
  for (const name of ["form-action", "base-uri"]) {
    const v = csp.get(name);
    assert(!v || v.join(" ") === "'none'", `${name} cambió.`);
  }
  const bad = [...csp].flatMap(([k, v]) => v.filter((x) => /^https?:|\*|unsafe-/.test(x)).map((x) => `${k} ${x}`));
  assert(bad.length === 0, `La CSP admite orígenes o evaluación insegura: ${bad.join(", ")}`);
});

check("Los hashes de la CSP coinciden con el <script> y el <style> (app instalable y descarga)", () => {
  for (const [label, html] of [["app/index.html", appHtml], [config.downloadName, downloadHtml]]) {
    const status = cspStatus(html);
    assert(status.ok, `${label}: ${status.problems.join(" ")} Corré npm run seal y volvé a armar.`);
  }
  // y el mismo hash exacto en las dos copias: el build no tocó el código
  for (const tag of ["script", "style"]) {
    const a = inlineBlocks(appHtml, tag)[0] || "";
    const b = inlineBlocks(downloadHtml, tag)[0] || "";
    assert(cspHash(a) === cspHash(b), `El <${tag}> de la app instalable no es idéntico al de la descarga.`);
  }
});

check("Los créditos «Diseñado por Jagā Soluciones Informáticas» están en la landing, la app y la descarga", () => {
  const landingHtml = exists("index.html") ? read("index.html") : "";
  for (const [label, html] of [["landing", landingHtml], ["app instalable", appHtml], ["descarga", downloadHtml]]) {
    assert(hasCredit(html), `Falta el crédito en la ${label}: tiene que decir «${CREDIT_TEXT}» con un enlace a ${CREDIT_URL}.`);
  }
  const foot = appHtml.match(/<footer class="app-foot">[\s\S]*?<\/footer>/);
  assert(foot && hasCredit(foot[0]), "El pie de la app tiene que tener el crédito con su enlace.");
  const mainBlock = appHtml.match(/<main\b[\s\S]*?<\/main>/);
  assert(mainBlock && mainBlock[0].includes('class="app-foot"'), "El pie de la app tiene que estar dentro de <main> (si no, queda tapado por la barra de pestañas).");
});

check("La copia para descargar es idéntica al original", () => {
  assert(existsSync(SOURCE), `No encuentro el original ${SOURCE}`);
  const a = readFileSync(SOURCE);
  const b = readFileSync(join(OUT, "descargas", config.downloadName));
  assert(a.equals(b), "El archivo de descargas/ no es idéntico al original.");
  const sums = read("descargas/SHA256SUMS.txt").trim();
  assert(sums === `${sha256Hex(a)}  ${config.downloadName}`, "SHA256SUMS.txt no coincide con el archivo.");
});

check("Las versiones de la landing coinciden con las de la app", () => {
  const source = readFileSync(SOURCE, "utf8");
  for (const v of [config.appVersion, config.contentVersion, config.contentReviewed]) assert(source.includes(`"${v}"`), `La app no contiene "${v}".`);
  const landing = read("index.html");
  assert(landing.includes(config.appVersion) && landing.includes(config.contentVersion), "La landing no muestra las versiones.");
});

// ---------- Service Worker y manifest
check("El Service Worker guarda solo archivos que existen", () => {
  const sw = read("app/sw.js");
  assert(!sw.includes("__VERSION__") && !sw.includes("__PRECACHE__"), "Quedaron marcadores sin completar.");
  const list = JSON.parse(sw.match(/const PRECACHE = (\[[\s\S]*?\]);/)[1]);
  assert(list.includes("/app/"), "El precache no incluye /app/.");
  for (const url of list) assert(exists(urlToFile(url)), `El precache pide ${url}, que no existe en dist/.`);
});

check("Manifest instalable (ids, alcance, íconos, atajos)", () => {
  const m = JSON.parse(read("app/manifest.webmanifest"));
  for (const key of ["name", "short_name", "start_url", "scope", "display", "icons", "id"]) assert(m[key], `Falta «${key}».`);
  assert(m.display === "standalone", "display debería ser standalone.");
  assert(m.start_url.startsWith(m.scope), "start_url queda fuera del alcance (scope).");
  assert(m.scope === "/app/", "El scope tiene que ser /app/ (ahí vive el Service Worker).");
  const has = (size, purpose) => m.icons.some((i) => i.sizes === size && i.purpose === purpose);
  assert(has("192x192", "any") && has("512x512", "any"), "Faltan los íconos 192 y 512.");
  assert(has("512x512", "maskable"), "Falta el ícono maskable.");
  for (const icon of m.icons) {
    const file = urlToFile(icon.src);
    assert(exists(file), `No existe ${icon.src}`);
    const { width, height } = pngSize(readFileSync(join(OUT, file)));
    assert(icon.sizes === `${width}x${height}`, `${icon.src} declara ${icon.sizes} pero mide ${width}x${height}.`);
  }
  for (const s of m.shortcuts || []) assert(s.url.startsWith(m.scope), `El atajo ${s.name} sale del alcance.`);
});

// ---------- landing
const landing = exists("index.html") ? read("index.html") : "";
check("Landing: sin marcadores, sin pedidos externos, sin código en línea", () => {
  assert(!/\{\{[A-Z0-9_]+\}\}/.test(landing), "Quedaron marcadores {{…}}.");
  assert(inlineBlocks(landing, "script").length === 0, "Hay <script> en línea: la CSP lo bloquearía.");
  assert(inlineBlocks(landing, "style").length === 0, "Hay <style> en línea: la CSP lo bloquearía.");
  assert(!/\sstyle="/.test(landing), 'Hay atributos style="…": la CSP los bloquearía.');
  assert(!/\son[a-z]+="/i.test(landing), "Hay manejadores on…=: la CSP los bloquearía.");
  // Los enlaces <a href="https://…"> a otros sitios están permitidos: son navegación, no pedidos de la página.
  const externalHtml = landing.match(/<(?:script|img|iframe|source|video|audio|embed|object|track)\b[^>]*\ssrc="https?:\/\/[^"]+"|<link\b[^>]*\shref="https?:\/\/[^"]+"/g);
  assert(!externalHtml, `index.html pide recursos externos: ${externalHtml && externalHtml[0]}`);
  for (const file of ["landing.css", "landing.js"]) {
    const text = read(file);
    const external = text.match(/url\(\s*["']?https?:|@import\s+["']?https?:|fetch\(\s*["'`]https?:|new\s+(?:WebSocket|EventSource)\(/g);
    assert(!external, `${file} pide recursos externos: ${external && external[0]}`);
  }
  const csp = readCsp(landing);
  assert(csp && csp.get("default-src")?.join("") === "'none'", "La landing necesita su CSP (default-src 'none').");
  assert(csp.get("script-src")?.join(" ") === "'self'", "script-src de la landing debería ser 'self'.");
});

check("Landing: enlaces y anclas internas existen", () => {
  const ids = new Set([...landing.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const problems = [];
  for (const m of landing.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    const value = m[1];
    if (value.startsWith("#")) {
      if (!ids.has(value.slice(1))) problems.push(`ancla ${value}`);
    } else if (value.startsWith("/")) {
      if (!exists(urlToFile(value))) problems.push(`archivo ${value}`);
    }
  }
  assert(problems.length === 0, `No existen: ${[...new Set(problems)].join(", ")}`);
  assert(landing.includes(`href="/descargas/${config.downloadName}"`), "El enlace de descarga no apunta al archivo.");
  const fonts = [...read("landing.css").matchAll(/url\(([^)]+)\)/g)].map((m) => m[1].replace(/["']/g, ""));
  for (const f of fonts) assert(exists(urlToFile(f)), `La hoja de estilos pide ${f}, que no existe.`);
});

check("Landing: publica la huella SHA-256 de la descarga y de cada archivo de la app", () => {
  const download = readFileSync(join(OUT, "descargas", config.downloadName));
  const expected = [
    [config.downloadName, sha256Hex(download)],
    ["app/index.html", sha256Hex(readFileSync(join(OUT, "app", "index.html")))],
    ["app/sw.js", sha256Hex(readFileSync(join(OUT, "app", "sw.js")))],
    ["app/manifest.webmanifest", sha256Hex(readFileSync(join(OUT, "app", "manifest.webmanifest")))],
  ];
  for (const [name, hash] of expected) assert(landing.includes(hash), `La landing no muestra el SHA-256 correcto de ${name}.`);
  assert(landing.includes(`<code id="sha">${expected[0][1]}</code>`), "La huella principal (#sha) no es la de la descarga.");
});

check("Landing: idioma, viewport, título y un solo h1", () => {
  assert(/<html lang="es-AR"/.test(landing), "Falta lang=es-AR.");
  assert(/<meta name="viewport" content="[^"]*width=device-width/.test(landing), "Falta el viewport.");
  assert(/<title>[^<]{10,}<\/title>/.test(landing), "Falta el título.");
  assert((landing.match(/<h1[\s>]/g) || []).length === 1, "Tiene que haber exactamente un <h1>.");
  const imgs = [...landing.matchAll(/<img\b[^>]*>/g)].filter((m) => !/\salt=/.test(m[0]));
  assert(imgs.length === 0, "Hay imágenes sin alt.");
});

// ---------- vercel.json
check("vercel.json: JSON válido y rutas con encabezados existentes", () => {
  const v = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
  assert(v.trailingSlash === true, "trailingSlash debe ser true para que /app abra /app/ (dentro del alcance del Service Worker).");
  assert(v.outputDirectory === "dist", "outputDirectory debe ser dist.");
  for (const rule of v.headers) {
    if (/[():*]/.test(rule.source)) continue;
    assert(exists(urlToFile(rule.source)), `vercel.json trae reglas para ${rule.source}, que no existe en dist/.`);
  }
});

// ---------- README (aviso, no bloquea la publicación)
// Solo con la app real: con la réplica de prueba (--source tests/fixtures/…) la huella es otra a propósito.
const readmePath = join(ROOT, "README.md");
const realSource = SOURCE === resolve(ROOT, "source/famsurvivor_standalone.html");
if (realSource && existsSync(readmePath) && existsSync(SOURCE)) {
  const published = readmeHash(readFileSync(readmePath, "utf8"));
  const actual = sha256Hex(readFileSync(SOURCE));
  if (published && published !== actual) {
    warnings.push(`El README muestra una huella vieja (${published.slice(0, 12)}…). Corré npm run release antes de subir los cambios.`);
  }
}

const total = passed + failures.length;
for (const w of warnings) console.warn(`  ⚠ ${w}`);
if (failures.length) {
  console.error(`\n${failures.length} de ${total} comprobaciones fallaron:\n`);
  for (const f of failures) console.error(`  ✖ ${f}\n`);
  process.exit(1);
}
console.log(`Las ${total} comprobaciones de dist/ pasaron.`);
