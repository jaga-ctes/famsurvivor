#!/usr/bin/env node
/**
 * Arma dist/ a partir de UN solo archivo de la app (source/famsurvivor_standalone.html):
 *
 *   dist/index.html            landing, presentación, manual y verificación   (site/)
 *   dist/app/index.html        la app como PWA instalable      (el standalone, sin tocar su script ni su CSS)
 *   dist/app/manifest.webmanifest
 *   dist/app/sw.js             Service Worker con versión automática
 *   dist/descargas/<archivo>   el .html original, byte por byte, para guardar en la computadora
 *   dist/descargas/SHA256SUMS.txt
 *
 * Antes de armar nada comprueba que la CSP del archivo esté «sellada»: si el <script> o el <style> se
 * editaron a mano sin recalcular sus hashes, el navegador los bloquearía y la app se vería rota.
 * En ese caso se detiene y pide correr `npm run seal`.
 *
 * Qué cambia en la copia de /app/ y por qué (todo fuera del <script> y del <style>, así los hashes de la CSP siguen válidos):
 *   1. data-build="standalone" -> "pwa": la app deja de mostrarse como «versión de un solo archivo» y registra el Service Worker.
 *   2. CSP: se suman manifest-src, worker-src e img-src 'self'. Se mantiene connect-src 'none'.
 *   3. <link rel="manifest"> y un apple-touch-icon en PNG (iOS no admite bien los de tipo data:).
 *
 * El build es reproducible: no escribe fechas ni nada que cambie entre corridas, así que los SHA-256
 * publicados se pueden volver a obtener desde el repositorio.
 *
 * Uso: node tools/build.mjs [--source ruta.html] [--out dist]
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256Hex, cspStatus, relaxCspForPwa, replaceOnce, formatLongDate, formatKb } from "./lib.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const SOURCE = resolve(ROOT, opt("--source", "source/famsurvivor_standalone.html"));
const OUT = resolve(ROOT, opt("--out", "dist"));

const stop = (message) => {
  console.error(`\nERROR: ${message}\n`);
  process.exit(1);
};

if (!existsSync(SOURCE)) {
  stop(
    `Falta el archivo de la app: ${SOURCE}\n` +
      `Copiá famsurvivor_standalone.html dentro de la carpeta source/ (con ese nombre) y volvé a correr el build.`
  );
}

const config = JSON.parse(readFileSync(join(ROOT, "site.config.json"), "utf8"));
const sourceBytes = readFileSync(SOURCE);
const sourceHtml = sourceBytes.toString("utf8");

// La CSP de la app va por hash: un cambio en el <script> o el <style> sin recalcularlos deja la app rota.
const csp = cspStatus(sourceHtml);
if (!csp.ok) {
  stop(
    `La política de seguridad (CSP) del archivo de la app no coincide con su código:\n  - ${csp.problems.join("\n  - ")}\n` +
      `Si editaste el archivo a propósito, corré:  npm run seal   y después volvé a correr el build.`
  );
}

// La landing muestra la versión: tiene que coincidir con la de la app, o el sitio miente.
for (const [label, value] of [
  ["appVersion", config.appVersion],
  ["contentVersion", config.contentVersion],
  ["contentReviewed", config.contentReviewed],
]) {
  if (!sourceHtml.includes(`"${value}"`)) {
    stop(`site.config.json dice ${label} = "${value}", pero el archivo de la app no contiene esa cadena. Actualizá site.config.json.`);
  }
}

// ---- 1. empezar de cero
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(join(ROOT, "site"), OUT, { recursive: true });

// ---- 2. la app como PWA
let app = sourceHtml;
try {
  app = replaceOnce(app, 'data-build="standalone"', 'data-build="pwa"', "data-build");
  app = relaxCspForPwa(app);
  // Se quita cualquier apple-touch-icon previo (en la app viene como data:, que iOS no usa bien) y se agregan
  // el manifest y el ícono en PNG justo antes de </head>: un ancla que existe siempre y no depende de otras etiquetas.
  app = app.replace(/[ \t]*<link rel="apple-touch-icon"[^>]*>\n?/g, "");
  app = replaceOnce(
    app,
    "</head>",
    '  <link rel="manifest" href="manifest.webmanifest">\n  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">\n</head>',
    "</head>"
  );
  if (!app.includes('register("./sw.js")')) {
    throw new Error('El script de la app no registra "./sw.js". El Service Worker tiene que estar en /app/sw.js.');
  }
} catch (error) {
  stop(error.message);
}
mkdirSync(join(OUT, "app"), { recursive: true });
writeFileSync(join(OUT, "app", "index.html"), app);

const PRECACHE = [
  "/app/",
  "/app/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];
const swVersion = `${config.appVersion}-${config.contentVersion}-${sha256Hex(app).slice(0, 10)}`;
const swTemplate = readFileSync(join(ROOT, "tools", "sw.template.js"), "utf8");
for (const marker of ["__VERSION__", "__PRECACHE__"]) {
  if (swTemplate.split(marker).length !== 2) stop(`sw.template.js tiene que contener ${marker} exactamente una vez.`);
}
const sw = swTemplate.replace("__VERSION__", swVersion).replace("__PRECACHE__", () => JSON.stringify(PRECACHE, null, 2));
writeFileSync(join(OUT, "app", "sw.js"), sw);
const manifest = readFileSync(join(ROOT, "tools", "manifest.template.json"));
writeFileSync(join(OUT, "app", "manifest.webmanifest"), manifest);

// ---- 3. descarga para la computadora: el archivo original, byte por byte
const downloadHash = sha256Hex(sourceBytes);
mkdirSync(join(OUT, "descargas"), { recursive: true });
writeFileSync(join(OUT, "descargas", config.downloadName), sourceBytes);
writeFileSync(join(OUT, "descargas", "SHA256SUMS.txt"), `${downloadHash}  ${config.downloadName}\n`);

// ---- 4. SHA-256 de lo que se instala, para quien quiera auditar la app publicada
const appHash = sha256Hex(app);
const swHash = sha256Hex(sw);
const manifestHash = sha256Hex(manifest);

// ---- 5. landing: completar los datos que cambian con cada versión
const values = {
  APP_VERSION: config.appVersion,
  CONTENT_VERSION: config.contentVersion,
  CONTENT_REVIEWED_LONG: formatLongDate(config.contentReviewed),
  DOWNLOAD_NAME: config.downloadName,
  DOWNLOAD_SIZE: formatKb(sourceBytes.length),
  DOWNLOAD_SHA256: downloadHash,
  APP_SHA256: appHash,
  SW_SHA256: swHash,
  MANIFEST_SHA256: manifestHash,
  REPO_URL: config.repoUrl,
};
for (const [key, value] of Object.entries(values)) {
  if (typeof value !== "string" || !value) stop(`Falta el valor de ${key} (revisá site.config.json).`);
}
let landing = readFileSync(join(OUT, "index.html"), "utf8");
for (const [key, value] of Object.entries(values)) landing = landing.split(`{{${key}}}`).join(value);
const left = landing.match(/\{\{[A-Z0-9_]+\}\}/g);
if (left) stop(`Quedaron marcadores sin completar en index.html: ${[...new Set(left)].join(", ")}`);
writeFileSync(join(OUT, "index.html"), landing);

console.log(`OK  ${OUT}`);
console.log(`    app ${config.appVersion} (contenido ${config.contentVersion}), Service Worker ${swVersion}`);
console.log(`    descarga ${config.downloadName}  ${values.DOWNLOAD_SIZE}`);
console.log(`    sha256 ${downloadHash}  ${config.downloadName}`);
console.log(`    sha256 ${appHash}  app/index.html`);
console.log(`    sha256 ${swHash}  app/sw.js`);
console.log(`    sha256 ${manifestHash}  app/manifest.webmanifest`);
