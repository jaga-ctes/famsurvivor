# FamSurvivor — desarrollo, build y pruebas

Detalle técnico del sitio. Para publicar, seguí [PUBLICAR.md](PUBLICAR.md).

## Cómo está armado

Todo sale de **un solo archivo de la app**: `source/famsurvivor_standalone.html` (HTML + CSS + JavaScript en un archivo, sin dependencias ni pedidos de red). El build arma, a partir de él:

```
/                  landing: presentación, instalación, verificación SHA-256, manual, privacidad y preguntas
/app/              la app como PWA instalable (manifest + Service Worker), funciona sin conexión
/descargas/        el .html original, byte por byte, y su SHA256SUMS.txt
```

| Carpeta o archivo | Qué es |
| --- | --- |
| `source/famsurvivor_standalone.html` | La app. Es lo único que cambia cuando sale una versión nueva |
| `site/` | La landing tal cual se publica: `index.html`, `landing.css`, `landing.js`, íconos y tipografías |
| `site.config.json` | Versiones que muestra la landing, nombre de la descarga y dirección del repositorio |
| `i18n/` | Traducciones de la app: `es-AR.json` (referencia), `en.json`, `pt-BR.json`, `fr.json` |
| `tools/i18n.mjs` | Valida las traducciones y las incrusta en la app |
| `tools/seal.mjs` | Recalcula las huellas de la CSP de la app después de editarla a mano |
| `tools/build.mjs` | Arma `dist/` (lo corre también Vercel) |
| `tools/readme-hash.mjs` | Escribe en el README la huella SHA-256 de la descarga |
| `tools/serve.mjs` | Servidor local que imita a Vercel (aplica los encabezados de `vercel.json`) |
| `tools/*.template.*` | Plantillas del Service Worker y del manifest |
| `tests/check-dist.mjs` | 14 comprobaciones sin navegador; si una falla, Vercel no publica |
| `tests/browser_test.py` | 40 pruebas en Chrome headless (Playwright) |
| `vercel.json` | Comando de build, carpeta de salida, encabezados de seguridad y caché |

## Comandos

Hace falta Node 22 o más nuevo (recomendado: la versión LTS actual; Node 20 ya no tiene soporte y Vercel lo dio de baja el 1 de octubre de 2026). No hay dependencias que instalar.

```bash
npm run release   # incrusta los idiomas, sella la CSP, actualiza la huella del README, arma dist/ y corre las comprobaciones
npm run dev       # arma dist/ y lo sirve en http://localhost:4173
npm run i18n      # solo validar e incrustar los idiomas (--check: solo validar)
npm run seal      # solo sellar la CSP (después de editar el <script> o el <style> de la app)
npm run build     # solo armar dist/
npm run check     # solo las 14 comprobaciones
```

`localhost` cuenta como sitio seguro: el Service Worker y el cifrado de la app funcionan sin HTTPS.

## La CSP de la app y por qué hay que «sellar»

La app trae una política de seguridad muy cerrada (`default-src 'none'`, `connect-src 'none'`) que solo deja correr **su** `<script>` y **su** `<style>`, identificados por su huella SHA-256. Si se edita cualquiera de los dos y la huella no se actualiza, el navegador bloquea el bloque entero: sin `<style>` la app se ve sin estilos; sin `<script>`, en blanco.

`npm run seal` recalcula las dos huellas y las escribe en la etiqueta `<meta http-equiv="Content-Security-Policy">`. El build se detiene con un mensaje claro si te olvidaste, así que nunca se publica una versión rota.

Para agregar algo visible a la app (por ejemplo, en el pie), el lugar es **dentro de `<main>`**: la barra de pestañas es fija y tapa lo que quede después de `<main>`, y `<main>` se oculta solo cuando la app está bloqueada o se imprime.

## Qué hace el build con la copia de `/app/`

Cambia solo lo que está **fuera** del `<script>` y del `<style>`, así las huellas de la CSP siguen siendo válidas:

| Cambio | Para qué |
| --- | --- |
| `data-build="standalone"` pasa a `"pwa"` | La app deja de mostrarse como versión de un solo archivo, registra el Service Worker y ofrece instalar |
| CSP: se suman `manifest-src 'self'`, `worker-src 'self'` e `img-src 'self' data:` | Sin eso el navegador no puede leer el manifest ni registrar el Service Worker. Las huellas de script y estilo y `connect-src 'none'` quedan como estaban |
| Se agrega `<link rel="manifest">` y un `apple-touch-icon` en PNG | Instalación en Android, escritorio e iOS |

El build es **reproducible**: no escribe fechas ni nada que cambie entre corridas. Con el mismo repositorio, cualquiera obtiene las mismas huellas.

## Huellas SHA-256

En cada build se calculan y se publican en la landing (sección «Verificar»):

- `descargas/FamSurvivor-v2.html`: idéntica a `source/famsurvivor_standalone.html` del repositorio. También va a `descargas/SHA256SUMS.txt` y al README.
- `app/index.html`, `app/sw.js` y `app/manifest.webmanifest`: lo que se instala como PWA, para quien quiera auditarlo.

Se eligió SHA-256 porque es el estándar para verificar descargas y se calcula sin instalar nada en Windows (`Get-FileHash`), macOS (`shasum -a 256`) y Linux (`sha256sum`). MD5 y SHA-1 ya no sirven para esto; SHA-512 no agrega nada práctico acá y BLAKE3 no viene instalado en ningún sistema.

`.gitattributes` marca el archivo de la app como binario para git: así ningún checkout le cambia los saltos de línea y su huella es la misma en cualquier sistema.

## Pruebas

```bash
npm run test:pipeline        # build + 14 comprobaciones con una réplica mínima de la app
npm run test:browser         # 40 pruebas en Chrome headless sobre la réplica (hace falta Playwright y google-chrome)

# con la app real:
npm run build && npm run check
python3 tests/browser_test.py --dir dist --source source/famsurvivor_standalone.html
```

`browser_test.py` prueba el medidor de la portada, accesibilidad con axe-core (claro y oscuro), los créditos del pie y su contraste, la descarga y su huella, el botón de copiar, que Chrome dé la app por instalable, el Service Worker, la recarga sin conexión y los encabezados. Funciona igual con la réplica y con la app real.

Dentro de la app, `/app/?selftest` corre 34 pruebas en el navegador: los cálculos y, desde la 2.1.0, que cada idioma tenga todos los textos de la interfaz y del contenido, con los mismos marcadores `{x}`.

## Idiomas

La app está en español (por defecto), inglés, portugués de Brasil y francés. Se elige en la bienvenida o en Ficha → Apariencia, y el idioma elegido se recuerda aparte, para que también la pantalla de bloqueo salga en ese idioma.

- **Interfaz** (`d`): las mismas claves que el diccionario de la app (`var dt={…}`), con los mismos marcadores `{x}`.
- **Contenido** (`c`): amenazas, pasos de emergencia, guías, pilares, productos sugeridos, roles, regiones y fuentes. Se traduce por frase: la clave es el texto en español tal como está en la app. La app cambia esos textos en memoria; los `id` no se tocan.
- **Lo que ya está guardado:** al cambiar de idioma, los textos por defecto que la app había creado (revisiones, tareas de las plantillas, datos del ejemplo, nombres como «Adulto 1») pasan al idioma nuevo. Lo que escribió el usuario queda como está.
- **Unidades:** se guardan con su id en español (`unidad`, `ración`…) y solo cambia cómo se muestran (`unit.<id>_one` / `_other`).

Para corregir una traducción: editá `i18n/<idioma>.json` y corré `npm run release`. Si cambiás un texto en español dentro de la app, corré `npm run i18n -- --sync-es` y actualizá las traducciones: la herramienta avisa qué falta y el autodiagnóstico falla si queda algo sin traducir.

## Límites que conviene conocer

- **El `.html` descargado no se instala ni se actualiza solo.** Según el navegador, al abrirlo como archivo local puede no guardar los datos ni ofrecer cifrado. La landing lo dice y recomienda hacer respaldos.
- **iPhone y iPad:** Safari puede borrar los datos de un sitio sin uso después de unos 7 días, salvo que esté agregado a la pantalla de inicio. La landing y la app lo avisan.
- **Falta probar en teléfonos reales** (instalación, safe areas, Wake Lock, `tel:`) y con lector de pantalla (TalkBack/VoiceOver): todo se probó en Chrome headless.
- **Contenido pendiente de validar** con Defensa Civil o la autoridad local: la app marca cada cifra con su fuente y su estado de verificación.
- La landing no instala la app por sí misma: el alcance de la PWA es `/app/`.
- **Traducciones:** las hizo una IA a partir del español y se probaron en la app, pero no las revisó una persona nativa de cada idioma. Antes de difundirlas, conviene que alguien las lea, sobre todo los pasos de emergencia.

## Si tenés el código modular de la app

La app v2 se escribió en módulos (`js/core`, `js/store`, `js/ui`, `content/`) y se compiló a este archivo único. Los arreglos de la 2.0.1 y la 2.0.2, la capa visual y los idiomas de la 2.1.0 se hicieron directamente sobre el archivo compilado; si volvés a compilar desde los módulos, pasales los mismos cambios antes (están descriptos uno por uno en el [CHANGELOG](../CHANGELOG.md)), o se pierden.
