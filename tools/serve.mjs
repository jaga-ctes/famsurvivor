#!/usr/bin/env node
/**
 * Servidor estático local que imita a Vercel: sirve dist/ y aplica los headers de vercel.json.
 * Uso: node tools/serve.mjs [--dir dist] [--port 4173]
 * localhost cuenta como contexto seguro: el Service Worker y el cifrado funcionan sin HTTPS.
 */
import http from "node:http";
import { readFileSync, existsSync, statSync, createReadStream } from "node:fs";
import { join, dirname, extname, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const DIST = join(ROOT, opt("--dir", "dist"));
const PORT = Number(opt("--port", process.env.PORT || 4173));
const vercel = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
const rules = (vercel.headers || []).map((r) => ({ re: new RegExp("^" + r.source + "$"), headers: r.headers }));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    let path;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("400"); // %E0%A4%A y similares: antes tiraban abajo el servidor
    }
    let file = normalize(join(DIST, path));
    // DIST + separador: sin eso, /../dist-test/… pasaba el control porque «dist-test» empieza con «dist».
    if (file !== DIST && !file.startsWith(DIST + sep)) {
      res.writeHead(403);
      return res.end("403");
    }
    if (existsSync(file) && statSync(file).isDirectory()) {
      if (!path.endsWith("/")) {
        res.writeHead(308, { Location: path + "/" + url.search });
        return res.end();
      }
      file = join(file, "index.html");
    }
    if (!existsSync(file)) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("404");
    }
    const headers = {
      "Content-Type": MIME[extname(file)] || "application/octet-stream",
      "Cache-Control": "public, max-age=0, must-revalidate",
    };
    for (const rule of rules) if (rule.re.test(path)) for (const h of rule.headers) headers[h.key] = h.value;
    res.writeHead(200, headers);
    createReadStream(file).pipe(res);
  })
  .listen(PORT, () => console.log(`http://localhost:${PORT}  (sirviendo ${DIST})`));
