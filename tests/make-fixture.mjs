#!/usr/bin/env node
/**
 * Genera tests/fixtures/mini-standalone.html: una réplica MINÚSCULA de famsurvivor_standalone.html
 * con la misma estructura que el build necesita (CSP con hashes, data-build, íconos data:, registro
 * del Service Worker con "./sw.js", ?tab= y ?mode=emergency, pie con los créditos dentro de <main>).
 * No es la app: sirve solo para probar el pipeline. Toma las versiones de site.config.json.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cspHash } from "../tools/lib.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(join(ROOT, "site.config.json"), "utf8"));

const css = `body{font:16px system-ui;margin:0;padding:1rem;background:#F7F9FC;color:#0B2545}
.card{background:#fff;border:1px solid #CBD5E3;border-radius:.75rem;padding:1rem;margin:.5rem 0}
.app-foot{margin-top:2rem;text-align:center;font-size:.875rem}
[hidden]{display:none!important}`;

const js = `(()=>{
var dn=${JSON.stringify(config.appVersion)},Qt=${JSON.stringify(config.contentVersion)},Yt=${JSON.stringify(config.contentReviewed)};
var g={tab:"inicio",installEvent:null,swWaiting:null,standaloneFile:document.documentElement.dataset.build==="standalone"};
var le=["inicio","hogar","despensa","plan","ajustes"];
var st=document.getElementById("status");
function render(){
  var off=g.standaloneFile?"No disponible en la versión de un solo archivo":(navigator.serviceWorker&&navigator.serviceWorker.controller?"Lista para usarse sin conexión":"Todavía no: abrila una vez más con conexión");
  st.textContent="tab="+g.tab+"|offline="+off+"|install="+(g.installEvent?"si":"no")+"|v="+dn;
  document.getElementById("note").hidden=!g.standaloneFile;
  document.getElementById("app-version").textContent=dn+" · contenido "+Qt;
}
async function ci(){if(!(g.standaloneFile||!("serviceWorker"in navigator)||!/^https?:$/.test(location.protocol)))try{let e=await navigator.serviceWorker.register("./sw.js");e.waiting&&navigator.serviceWorker.controller&&(g.swWaiting=e.waiting);navigator.serviceWorker.addEventListener("controllerchange",()=>render())}catch{}}
async function Gn(){
  var e=new URLSearchParams(location.search);
  var a=e.get("tab")||location.hash.slice(1);le.includes(a)&&(g.tab=a);
  window.addEventListener("beforeinstallprompt",t=>{t.preventDefault();g.installEvent=t;render()});
  window.addEventListener("appinstalled",()=>{g.installEvent=null;render()});
  e.get("mode")==="emergency"&&(document.getElementById("em").hidden=!1);
  render();ci();
  document.documentElement.dataset.ready="1";
}
Gn();})();`;

const icon = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#0B2545"/></svg>'
).toString("base64");
// PNG de 1x1 válido, solo para que el marcador exista
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const html = `<!DOCTYPE html>
<html lang="es-AR" data-theme="auto" data-scheme="light" data-build="standalone">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src '${cspHash(js)}'; style-src '${cspHash(css)}'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#0B2545">
  <title>FamSurvivor — réplica de prueba</title>
  <link rel="icon" href="data:image/svg+xml;base64,${icon}" type="image/svg+xml">
  <link rel="apple-touch-icon" href="data:image/png;base64,${png}">
  <style>${css}</style>
</head>
<body>
<main>
  <h1>FamSurvivor (réplica de prueba)</h1>
  <p class="card" id="note">Versión de un solo archivo: no se instala.</p>
  <p class="card" id="status" role="status"></p>
  <p class="card" id="em" hidden>Modo Emergencia abierto</p>
  <footer class="app-foot">
    <p><strong>FamSurvivor</strong> <span id="app-version"></span></p>
    <p>Diseñado por <a href="https://jagasoluciones.com/" target="_blank" rel="noopener noreferrer">Jagā Soluciones Informáticas</a></p>
  </footer>
</main>
<script>${js}</script>
</body>
</html>
`;

mkdirSync(join(ROOT, "tests", "fixtures"), { recursive: true });
writeFileSync(join(ROOT, "tests", "fixtures", "mini-standalone.html"), html);
console.log("tests/fixtures/mini-standalone.html generado");
