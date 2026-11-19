#!/usr/bin/env python3
"""Prueba en navegador real (Chrome headless) del sitio ya armado.

Uso: python3 tests/browser_test.py [--dir dist-test] [--shots /tmp/shots]
     python3 tests/browser_test.py --dir dist --source source/famsurvivor_standalone.html   (con la app real)
Requiere: playwright (Python), google-chrome, node.
Comprueba: landing sin errores ni violaciones de CSP, medidor, accesibilidad (axe-core), créditos del pie,
descarga idéntica y su huella, botón de copiar, instalabilidad de la PWA (CDP), Service Worker + recarga
sin conexión, y saca capturas en 390 px y 1280 px. Funciona con la réplica de prueba y con la app real.
"""
import argparse, hashlib, json, os, subprocess, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright


# La app real tiene una CSP sin 'unsafe-eval', y wait_for_function con una expresión en texto la evalúa con eval()
# dentro de la página: la primera vez Chrome lo permite (viene de DevTools), pero si tiene que reintentar, la CSP lo
# bloquea (EvalError) y la prueba falla o no según cuánto tarde la app. Por eso se espera con un selector o desde Python.
def wait_ready(page, timeout=5000):
    page.wait_for_selector('html[data-ready="1"]', state="attached", timeout=timeout)


def wait_js(page, expression, timeout=5000):
    end = time.time() + timeout / 1000
    while True:
        try:
            if page.evaluate(expression):
                return
        except Exception:
            pass  # la página está navegando: se reintenta
        if time.time() > end:
            raise AssertionError(f"Se agotó la espera: {expression}")
        page.wait_for_timeout(50)

ROOT = Path(__file__).resolve().parent.parent
ap = argparse.ArgumentParser()
ap.add_argument("--dir", default="dist-test")
ap.add_argument("--port", type=int, default=4199)
ap.add_argument("--shots", default="/tmp/shots")
ap.add_argument("--source", default="tests/fixtures/mini-standalone.html")
args = ap.parse_args()

DIST = ROOT / args.dir
SHOTS = Path(args.shots)
SHOTS.mkdir(parents=True, exist_ok=True)
BASE = f"http://localhost:{args.port}"
config = json.loads((ROOT / "site.config.json").read_text())

AXE_SOURCE = (ROOT / "tests/axe.min.js").read_text()
results = []
def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("  ok  " if ok else "  FALLA ") + name + (f"\n        {detail}" if (detail and not ok) else ""))

server = subprocess.Popen(["node", str(ROOT / "tools/serve.mjs"), "--dir", args.dir, "--port", str(args.port)],
                          stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
time.sleep(1.2)

def collect(page, bucket):
    page.on("console", lambda m: bucket.append(f"[{m.type}] {m.text}") if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: bucket.append(f"[pageerror] {e}"))
    page.on("requestfailed", lambda r: bucket.append(f"[requestfailed] {r.url} {r.failure}"))

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])

        # ---------- landing en teléfono ----------
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
                                  user_agent="Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36")
        page = ctx.new_page()
        logs = []
        collect(page, logs)
        page.goto(BASE + "/", wait_until="networkidle")
        check("Landing: sin errores de consola ni pedidos fallidos (teléfono)", not logs, "; ".join(logs))
        check("Landing: sin desborde horizontal a 390 px",
              page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1"),
              str(page.evaluate("[document.documentElement.scrollWidth, document.documentElement.clientWidth]")))
        check("Landing: plataforma detectada = android", page.evaluate("document.documentElement.dataset.platform") == "android")
        check("Landing: en Android se abre solo la guía de Android",
              page.evaluate("[document.getElementById('inst-android').open, document.getElementById('inst-ios').open, document.getElementById('inst-desktop').open]") == [True, False, False])
        fonts = page.evaluate("document.fonts.ready.then(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight))")
        check("Landing: cargan las tipografías propias", any("Barlow" in f for f in fonts) and any("Atkinson" in f for f in fonts), str(fonts))
        credit = page.evaluate("(() => { const a = document.querySelector('.foot-credit a'); return a && {text: a.closest('.foot-credit').innerText.replace(/\\s+/g, ' '), href: a.href}; })()")
        check("Landing: el pie dice «Diseñado por Jagā Soluciones Informáticas»",
              bool(credit) and "Diseñado por" in credit["text"] and "Jagā Soluciones Informáticas" in credit["text"] and credit["href"] == "https://jagasoluciones.com/", str(credit))
        page.screenshot(path=str(SHOTS / "landing-390-arriba.png"))
        page.screenshot(path=str(SHOTS / "landing-390-completa.png"), full_page=True)
        ctx.close()

        # ---------- landing en computadora ----------
        ctx = browser.new_context(viewport={"width": 1280, "height": 800}, device_scale_factor=1)
        page = ctx.new_page()
        logs = []
        collect(page, logs)
        csp_violations = []
        page.add_init_script("document.addEventListener('securitypolicyviolation', e => (window.__csp = window.__csp || []).push(e.violatedDirective + ' ' + e.blockedURI));")
        page.goto(BASE + "/", wait_until="networkidle")
        check("Landing: sin errores de consola ni pedidos fallidos (compu)", not logs, "; ".join(logs))
        check("Landing: ninguna violación de CSP", not page.evaluate("window.__csp || []"), str(page.evaluate("window.__csp || []")))
        check("Landing: sin desborde horizontal a 1280 px", page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1"))
        check("Landing: plataforma detectada = desktop", page.evaluate("document.documentElement.dataset.platform") == "desktop")
        page.screenshot(path=str(SHOTS / "landing-1280-arriba.png"))
        page.screenshot(path=str(SHOTS / "landing-1280-completa.png"), full_page=True)

        # medidor: valores iniciales
        read = lambda: page.evaluate("""() => ({
            days: document.getElementById('g-days').textContent,
            status: document.getElementById('g-status-text').textContent,
            missing: document.getElementById('g-missing').textContent,
            weak: [...document.querySelectorAll('.res')].filter(r => !r.querySelector('.weak').hidden).map(r => r.dataset.res)})""")
        init = read()
        check("Medidor: estado inicial = 2,1 días, el agua es el eslabón débil", init["days"] == "2,1" and init["weak"] == ["agua"], str(init))
        check("Medidor: dice cuánto falta", "agua" in init["missing"] and "bidones" in init["missing"], init["missing"])

        def set_range(id_, value):
            page.evaluate("([id, v]) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', {bubbles: true})); }", [id_, str(value)])

        set_range("r-agua", 12)       # 72 L / 11 = 6,5 días  -> el más débil pasa a ser la comida (30*700/5600 = 3,75 -> 3,7)
        s = read()
        check("Medidor: con 12 bidones el eslabón débil pasa a la comida", s["weak"] == [] and s["days"] == "3,7", str(s))
        set_range("r-comida", 40)     # 28000/5600 = 5 días ; agua 6,5 ; meds 20 -> 5
        s = read()
        check("Medidor: cubre la meta y desaparece «Te falta»", s["days"] == "5" and "Cubrís" in s["status"] and s["missing"] == "" and s["weak"] == [], str(s))
        set_range("r-meds", 1)        # 1 día
        s = read()
        check("Medidor: la medicación manda cuando es lo más bajo", s["weak"] == ["meds"] and s["days"] == "1", str(s))
        check("Medidor: la barra rayada marca lo que no llega", page.evaluate("document.querySelector('[data-res=meds] .bar').classList.contains('short')"))
        set_range("r-agua", 0)
        s = read()
        check("Medidor: con 0 bidones muestra 0 días sin romperse", s["days"] == "0" and s["weak"] == ["agua"], str(s))
        page.screenshot(path=str(SHOTS / "landing-1280-medidor-agua0.png"), clip={"x": 760, "y": 60, "width": 480, "height": 740})

        # accesibilidad con axe-core
        page.reload(wait_until="networkidle")
        page.evaluate(AXE_SOURCE)
        axe = page.evaluate("axe.run(document, {runOnly: {type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']}}).then(r => r.violations.map(v => ({id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes[0].html.slice(0, 140), why: v.nodes[0].failureSummary.slice(0, 220)})))")
        check("Accesibilidad (axe-core, claro): sin violaciones", not axe, json.dumps(axe, ensure_ascii=False, indent=2))
        ctx.close()

        # modo oscuro
        ctx = browser.new_context(viewport={"width": 1280, "height": 800}, color_scheme="dark")
        page = ctx.new_page()
        page.goto(BASE + "/", wait_until="networkidle")
        page.screenshot(path=str(SHOTS / "landing-1280-oscuro.png"))
        ratio = page.evaluate("""(() => {
            const lum = (c) => { const [r, g, b] = c.match(/\\d+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
            const a = document.querySelector('.foot-credit a'); const f = document.querySelector('.foot');
            const [x, y] = [lum(getComputedStyle(a).color), lum(getComputedStyle(f).backgroundColor)].sort((p, q) => q - p);
            return Math.round((x + 0.05) / (y + 0.05) * 100) / 100; })()""")
        check("Landing (oscuro): el crédito del pie se lee (contraste ≥ 4,5:1)", ratio >= 4.5, str(ratio))
        page.evaluate(AXE_SOURCE)
        axe = page.evaluate("axe.run(document, {runOnly: {type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']}}).then(r => r.violations.map(v => ({id: v.id, n: v.nodes.length, sample: v.nodes[0].html.slice(0, 140), why: v.nodes[0].failureSummary.slice(0, 220)})))")
        check("Accesibilidad (axe-core, oscuro): sin violaciones", not axe, json.dumps(axe, ensure_ascii=False, indent=2))
        ctx.close()

        # ---------- descarga ----------
        ctx = browser.new_context(accept_downloads=True)
        page = ctx.new_page()
        page.goto(BASE + "/", wait_until="networkidle")
        with page.expect_download() as dl:
            page.click(f'a[href="/descargas/{config["downloadName"]}"]')
        d = dl.value
        saved = SHOTS / "descargado.html"
        d.save_as(str(saved))
        src = (ROOT / args.source).read_bytes()
        check("Descarga: el archivo se llama como se anuncia", d.suggested_filename == config["downloadName"], d.suggested_filename)
        check("Descarga: es idéntico byte por byte al original", saved.read_bytes() == src)
        check("Descarga: el SHA-256 de la landing es el del archivo",
              hashlib.sha256(saved.read_bytes()).hexdigest() == page.text_content("#sha").strip())
        ctx.close()

        # ---------- copiar la huella ----------
        ctx = browser.new_context()
        ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE)
        page = ctx.new_page()
        page.goto(BASE + "/#verificar", wait_until="networkidle")
        page.click("button[data-copy='sha']")
        copied = page.evaluate("navigator.clipboard.readText()")
        check("Verificar: el botón copia la huella exacta de la descarga", copied == page.text_content("#sha").strip(), copied)
        check("Verificar: el comando de auditoría usa la dirección real del sitio", page.text_content("[data-origin]") == BASE, page.text_content("[data-origin]"))
        ctx.close()

        # ---------- la app como PWA ----------
        import tempfile
        ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), executable_path="/usr/bin/google-chrome", args=["--no-sandbox"], headless=True, viewport={"width": 390, "height": 844})
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        logs = []
        collect(page, logs)
        page.add_init_script("document.addEventListener('securitypolicyviolation', e => (window.__csp = window.__csp || []).push(e.violatedDirective + ' ' + e.blockedURI));")
        r = page.goto(BASE + "/app", wait_until="networkidle")
        check("App: /app redirige a /app/ (dentro del alcance del Service Worker)", page.url == BASE + "/app/", page.url)
        wait_ready(page)
        reg = page.evaluate("navigator.serviceWorker.ready.then(r => ({scope: r.scope, state: r.active && r.active.state, script: r.active && r.active.scriptURL}))")
        check("App: el Service Worker se registra en /app/", reg["scope"] == BASE + "/app/" and reg["script"].endswith("/app/sw.js"), str(reg))
        check("App: sin errores de consola ni violaciones de CSP", not logs and not page.evaluate("window.__csp || []"), "; ".join(logs) + str(page.evaluate("window.__csp || []")))
        # La réplica de prueba tiene #status y #note; la app real, no. Cada comprobación sabe leer las dos.
        replica = page.evaluate("!!document.getElementById('status')")
        if replica:
            check("App: ya no se declara versión de un solo archivo", "No disponible" not in page.inner_text("#status") and page.evaluate("document.getElementById('note').hidden"))
        else:
            check("App: ya no se declara versión de un solo archivo", "un solo archivo" not in page.inner_text("body"))
        foot = page.evaluate("(() => { const f = document.querySelector('main .app-foot'); const a = f && f.querySelector('a'); return f && {text: f.innerText.replace(/\\s+/g, ' '), href: a && a.href, visible: !!f.offsetParent}; })()")
        check("App: el pie dice «Diseñado por Jagā Soluciones Informáticas» y muestra la versión",
              bool(foot) and foot["visible"] and "Diseñado por Jagā Soluciones Informáticas" in foot["text"] and config["appVersion"] in foot["text"] and foot["href"] == "https://jagasoluciones.com/", str(foot))

        # instalabilidad según Chrome
        cdp = ctx.new_cdp_session(page)
        cdp.send("Page.enable")
        errs = cdp.send("Page.getInstallabilityErrors")["installabilityErrors"]
        check("App: Chrome no reporta errores de instalabilidad", not errs, json.dumps(errs))
        print("        (instalabilidad según Chrome:", json.dumps(errs), ")")
        manifest = cdp.send("Page.getAppManifest")
        check("App: el manifest se lee sin errores", not manifest.get("errors") and manifest.get("data"), json.dumps(manifest.get("errors")))

        # recarga sin conexión
        page.reload(wait_until="networkidle")  # asegura que la página esté controlada por el SW
        wait_js(page, "navigator.serviceWorker.controller !== null")
        ctx.set_offline(True)
        page.goto(BASE + "/app/?tab=plan", wait_until="domcontentloaded")
        wait_ready(page)
        if replica:
            st = page.inner_text("#status")
            check("App: sin conexión abre y entiende ?tab=plan", "tab=plan" in st, st)
            check("App: sin conexión dice «Lista para usarse sin conexión»", "Lista para usarse sin conexión" in st, st)
        else:
            sel = page.evaluate("document.getElementById('tab-plan').getAttribute('aria-selected')")
            check("App: sin conexión abre y entiende ?tab=plan", sel == "true", str(sel))
            page.goto(BASE + "/app/?tab=ajustes", wait_until="domcontentloaded")
            wait_ready(page)
            st = page.inner_text("#panel-ajustes")
            check("App: sin conexión dice «Lista para usarse sin conexión»", "Lista para usarse sin conexión" in st, st[-300:])
        page.goto(BASE + "/app/?mode=emergency", wait_until="domcontentloaded")
        wait_ready(page)
        if replica:
            check("App: sin conexión abre el Modo Emergencia", page.evaluate("!document.getElementById('em').hidden"))
        else:
            check("App: sin conexión abre el Modo Emergencia", page.evaluate("!!document.querySelector('dialog.emergency[open]')"))
        # los íconos están fuera de /app/, pero los pide una página controlada por el Service Worker: tienen que salir del caché
        ok = page.evaluate("new Promise(res => { const i = new Image(); i.onload = () => res(i.naturalWidth); i.onerror = () => res(0); i.src = '/icons/icon-192.png?x=' + Date.now(); })")
        check("App: sin conexión carga el ícono guardado (desde el Service Worker)", ok == 192, str(ok))
        ctx.set_offline(False)

        # evento de instalación simulado: la app debe poder mostrarlo
        ctx.close()

        # ---------- encabezados reales ----------
        ctx = browser.new_context()
        api = ctx.request
        sw = api.get(BASE + "/app/sw.js")
        check("Encabezados: sw.js sin caché y como JavaScript", "must-revalidate" in sw.headers.get("cache-control", "") and "javascript" in sw.headers.get("content-type", ""), str(sw.headers))
        mf = api.get(BASE + "/app/manifest.webmanifest")
        check("Encabezados: manifest con el tipo correcto", "manifest+json" in mf.headers.get("content-type", ""), str(mf.headers))
        dlh = api.get(BASE + f"/descargas/{config['downloadName']}")
        check("Encabezados: la descarga fuerza «attachment»", dlh.headers.get("content-disposition") == "attachment", str(dlh.headers))
        check("Encabezados: nosniff y sin referrer", dlh.headers.get("x-content-type-options") == "nosniff" and dlh.headers.get("referrer-policy") == "no-referrer")
        ctx.close()
        browser.close()
finally:
    server.terminate()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)} de {len(results)} pruebas de navegador pasaron. Capturas en {SHOTS}")
sys.exit(1 if failed else 0)
