/**
 * Utilidades compartidas por el build, el sellado de la CSP y las comprobaciones.
 * Sin dependencias: solo módulos de Node.
 */
import { createHash } from "node:crypto";

export const sha256Hex = (data) => createHash("sha256").update(data).digest("hex");

/**
 * Hash en el formato que usa la CSP: sha256-<base64> del texto exacto del bloque.
 * El navegador normaliza los saltos de línea (CRLF y CR pasan a LF) antes de calcularlo,
 * así que acá se hace lo mismo: un archivo guardado con CRLF en Windows no rompe la CSP.
 */
export const cspHash = (text) =>
  "sha256-" + createHash("sha256").update(text.replace(/\r\n?/g, "\n"), "utf8").digest("base64");

/** Devuelve el contenido de cada <script> / <style> en línea (sin atributos src). */
export function inlineBlocks(html, tag) {
  const re = new RegExp(`<${tag}(\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g");
  const out = [];
  for (const m of html.matchAll(re)) if (!/\ssrc=/.test(m[1] || "")) out.push(m[2]);
  return out;
}

// Tolera cualquier orden de atributos y comillas simples o dobles; exige una sola etiqueta de CSP.
const CSP_TAG = /<meta\b[^>]*\bhttp-equiv\s*=\s*["']Content-Security-Policy["'][^>]*>/gi;
const CONTENT_ATTR = /(\bcontent\s*=\s*)(["'])([\s\S]*?)\2/i;
const HASH_TOKEN = /^'sha(256|384|512)-[A-Za-z0-9+/=]+'$/;

function cspTag(html) {
  const tags = html.match(CSP_TAG) || [];
  if (tags.length !== 1) throw new Error(`Esperaba exactamente 1 etiqueta <meta> de Content-Security-Policy y encontré ${tags.length}.`);
  const attr = tags[0].match(CONTENT_ATTR);
  if (!attr) throw new Error("La etiqueta de CSP no tiene atributo content.");
  return { tag: tags[0], attr };
}

export function readCsp(html) {
  let found;
  try {
    found = cspTag(html);
  } catch {
    return null;
  }
  const directives = new Map();
  for (const part of found.attr[3].split(";").map((x) => x.trim()).filter(Boolean)) {
    const [name, ...values] = part.split(/\s+/);
    directives.set(name.toLowerCase(), values);
  }
  return directives;
}

function writeCsp(html, directives) {
  const { tag } = cspTag(html);
  const content = [...directives].map(([k, v]) => [k, ...v].join(" ")).join("; ");
  const newTag = tag.replace(CONTENT_ATTR, (_m, prefix, quote) => `${prefix}${quote}${content}${quote}`);
  return replaceOnce(html, tag, newTag, "CSP");
}

/**
 * Compara los hashes de la CSP con el <script> y el <style> en línea del archivo.
 * Si no coinciden, el navegador bloquea ese bloque entero: con el <style> la app se ve sin estilos,
 * con el <script> queda en blanco.
 */
export function cspStatus(html) {
  const csp = readCsp(html);
  if (!csp) return { ok: false, problems: ["No hay una única etiqueta <meta> de Content-Security-Policy."] };
  const problems = [];
  for (const [tag, directive] of [["script", "script-src"], ["style", "style-src"]]) {
    const blocks = inlineBlocks(html, tag);
    if (blocks.length !== 1) {
      problems.push(`Esperaba 1 <${tag}> en línea y hay ${blocks.length}.`);
      continue;
    }
    const expected = `'${cspHash(blocks[0])}'`;
    if (!(csp.get(directive) || []).includes(expected)) {
      problems.push(`El <${tag}> cambió y ${directive} sigue con el hash viejo: el navegador lo va a bloquear.`);
    }
  }
  return { ok: problems.length === 0, problems };
}

/**
 * Recalcula los hashes de script-src y style-src a partir del <script> y el <style> en línea.
 * Conserva cualquier otra fuente de esas directivas; solo reemplaza los hashes.
 */
export function sealCsp(html) {
  const csp = readCsp(html);
  if (!csp) throw new Error("No hay una única etiqueta <meta> de Content-Security-Policy.");
  const changes = [];
  for (const [tag, directive] of [["script", "script-src"], ["style", "style-src"]]) {
    const blocks = inlineBlocks(html, tag);
    if (blocks.length !== 1) throw new Error(`Esperaba 1 <${tag}> en línea y hay ${blocks.length}. La CSP por hash cubre un solo bloque.`);
    const hash = `'${cspHash(blocks[0])}'`;
    const before = csp.get(directive) || [];
    const after = [...before.filter((v) => !HASH_TOKEN.test(v)), hash];
    if (before.join(" ") !== after.join(" ")) changes.push({ directive, before: before.join(" "), after: after.join(" ") });
    csp.set(directive, after);
  }
  return { html: changes.length ? writeCsp(html, csp) : html, changes };
}

/**
 * Ajusta la CSP de la app para servirla como PWA instalable:
 *  - manifest-src 'self': sin esto el navegador no puede leer el manifest (default-src 'none').
 *  - worker-src 'self': necesario para registrar el Service Worker.
 *  - img-src 'self' data: para el ícono de pantalla de inicio.
 * No toca script-src ni style-src (siguen atados por hash) ni connect-src.
 */
export function relaxCspForPwa(html) {
  const directives = readCsp(html);
  if (!directives) throw new Error("No hay una única etiqueta <meta> de Content-Security-Policy.");
  directives.set("manifest-src", ["'self'"]);
  directives.set("worker-src", ["'self'"]);
  directives.set("img-src", ["'self'", "data:"]);
  return writeCsp(html, directives);
}

/** Reemplaza exactamente una coincidencia; si hay 0 o varias, falla con un mensaje claro. */
export function replaceOnce(text, pattern, replacement, label) {
  const re = pattern instanceof RegExp ? new RegExp(pattern.source, pattern.flags.replace("g", "") + "g") : null;
  const count = re ? (text.match(re) || []).length : text.split(pattern).length - 1;
  if (count !== 1) {
    throw new Error(`«${label}»: esperaba 1 coincidencia y encontré ${count}. El archivo de la app cambió de forma y el build no sabe adaptarlo.`);
  }
  return text.replace(pattern, () => replacement); // función: el reemplazo es siempre literal, sin $1 ni $&
}

/** Ancho y alto de un PNG leyendo su cabecera IHDR. */
export function pngSize(buffer) {
  const signature = buffer.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") throw new Error("no es un PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

export const formatLongDate = (iso) =>
  new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));

export const formatKb = (bytes) => new Intl.NumberFormat("es-AR").format(Math.round(bytes / 1024)) + " KB";

/** Bloque del README que muestra el hash de la descarga, entre dos marcas HTML (invisibles en GitHub). */
export const README_MARKS = ["<!-- sha256:inicio -->", "<!-- sha256:fin -->"];

export function readmeHashBlock({ downloadName, hash, appVersion, size }) {
  return [
    README_MARKS[0],
    "",
    `| Archivo | Versión | Tamaño | SHA-256 |`,
    `| --- | --- | --- | --- |`,
    `| \`${downloadName}\` | ${appVersion} | ${size} | \`${hash}\` |`,
    "",
    README_MARKS[1],
  ].join("\n");
}

/** Devuelve el hash que figura hoy en el README, o null si no tiene el bloque. */
export function readmeHash(text) {
  const start = text.indexOf(README_MARKS[0]);
  const end = text.indexOf(README_MARKS[1]);
  if (start < 0 || end < start) return null;
  const m = text.slice(start, end).match(/`([0-9a-f]{64})`/);
  return m ? m[1] : null;
}
