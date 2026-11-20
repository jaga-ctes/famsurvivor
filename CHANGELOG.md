# Cambios

## 2.0.2 — 19 de noviembre de 2026

Correcciones detectadas con el sitio ya publicado. El contenido sigue siendo `2026.11.1`.

| # | Qué pasaba | Arreglo |
| --- | --- | --- |
| 1 | **Edades en la configuración inicial:** «Personas de 9 años o más» se guardaban como «Adulto/a (18 a 64)», y «1 a 8 años» como «4 a 8». En Hogar se veía otra edad, y a un chico de 9 a 13 años la app le podía asignar tareas del plan y contarle un celular | La configuración pregunta por las mismas siete franjas de edad que el editor de Hogar, y cada integrante se crea con la suya. Las tareas del plan siguen yendo solo a mayores de 14 |
| 2 | **Regiones:** con otro país elegido, se seguían ofreciendo las regiones de Argentina (y se podía aplicar su perfil de amenazas) | Las regiones aparecen solo con Argentina. En otro país se usa el perfil genérico y la app avisa que hay que ajustar cada amenaza. Al cambiar el país en «Datos del hogar», la región vuelve a «Genérico» |

Suma dos pruebas al autodiagnóstico (`?selftest`, 30 en total) y un tope de 40 integrantes con mascotas en la configuración.

**En el código modular:** el formulario de alta rápida genera un campo por franja (`band_<id>`, en el orden adulto, mayor, adol, n9, n4, n1, bebe) y la función de alta rápida crea cada integrante con esa franja (sigue aceptando `adults`, `kids` y `babies`). La región: `showIf` con `country === "AR"` en el alta, normalización a `"generico"` fuera de Argentina, el mismo reset en «Datos del hogar» y el selector de amenazas filtrado.

## 2.0.1 — 19 de noviembre de 2026

Versión de correcciones. El contenido (cifras, guías y fuentes) no cambia: sigue siendo `2026.11.1`, revisado el 11/11/2026.

### Créditos

- **Pie con «Diseñado por Jagā Soluciones Informáticas» en la app, la descarga y la landing.** En la app va dentro de `<main>`, arriba de la barra de pestañas, con la versión real (la completa el código, así no queda vieja). Se oculta al imprimir y con la app bloqueada. En la landing se lee en modo claro y oscuro.
- Las comprobaciones del build fallan si el crédito falta en cualquiera de las tres piezas.

### Por qué no aparecía el pie (y la app se veía rota)

1. **La CSP bloqueaba toda la hoja de estilos.** Al pegar CSS en el `<style>` de la app, su huella SHA-256 dejó de coincidir con la de la política de seguridad y el navegador descartó el bloque entero: la app quedaba sin estilos. Además, `check-dist` fallaba, así que Vercel no publicaba.
2. **El pie estaba después de `<script>`, fuera de `<main>`:** quedaba debajo de la barra de pestañas fija, sin la clase `.wrap` (que la app no tiene) y con la versión escrita a mano.
3. **El enlace del crédito usaba `color: var(--paper)`:** en modo oscuro, contraste 1,04:1 (invisible).
4. **En la landing el crédito estaba solo en `dist/`,** que el build borra y vuelve a armar (y que no se sube al repositorio): nunca iba a llegar a Vercel.

### App: errores corregidos

| # | Qué pasaba | Arreglo |
| --- | --- | --- |
| 1 | **Modo Emergencia:** si el navegador cerraba el diálogo (atrás en Android, Esc dos veces), el botón «Emergencia en curso» ya no lo volvía a abrir hasta recargar | Al cerrarse el diálogo por cualquier vía se limpia el estado (temporizador, Wake Lock y referencia) |
| 2 | Al minimizar una emergencia, el botón de arriba seguía diciendo «Emergencia» hasta cambiar de pestaña | El botón se actualiza al cerrar o minimizar |
| 3 | **Formularios:** tocar el margen interno de una hoja la cerraba como si fuera el fondo, y se perdía lo escrito | Solo cierra un toque fuera de la hoja |
| 4 | **Cifrado sin IndexedDB** (almacenamiento simple): al activarlo se borraba el estado cifrado recién guardado; si la app se cerraba antes del siguiente guardado, se perdían los datos | No se borra cuando el almacenamiento en uso es ese mismo |
| 5 | **Teclado en «Amenazas de tu zona»:** después de cada cambio el foco volvía al primer nivel; con flechas no se llegaba a «Alto» | El foco vuelve al nivel elegido |
| 6 | **Plan:** Punto A/B/C, la nota y el contacto fuera de la zona solo se guardaban al salir del campo; si el sistema cerraba la app mientras se escribía, se perdía | Se guarda mientras se escribe |
| 7 | Pilar **Efectivo** «Cubierto» con $ 0 guardados y sin objetivo | Queda «Sin empezar» |
| 8 | Borrar un **contacto** o una **medicación** no pedía confirmación (el resto sí) | Pide confirmación |
| 9 | «Usar una plantilla» de roles dos veces duplicaba las tareas | Solo suma las que faltan |
| 10 | Filtros de la Despensa aplastados en círculos de 44 px con el texto encimado | Los chips mantienen su ancho y la fila se desliza |
| 11 | El aviso de vencimiento se estiraba a todo el ancho de la tarjeta | Ocupa lo que mide su texto |
| 12 | «3 unidad», «2 paquete», «3 persona/s y 1 mascota/s» | «3 unidades», «2 paquetes», «3 personas y 1 mascota» |

### Sitio y herramientas

- **Sección «Verificar»** en la landing, con la huella SHA-256 de la descarga a la vista, botón para copiarla, comandos para Windows, macOS y Linux, y las huellas de `/app/`, `/app/sw.js` y `/app/manifest.webmanifest`. También en el menú y en el pie. En el teléfono, los comandos se cortan solo entre argumentos (nunca después de un guion, como «-Algo / rithm»), también a 320 px.
- Menú de la landing en el teléfono: los enlaces bajan a una segunda línea en vez de quedar escondidos a la derecha (antes, en pantallas de 360 px, «Preguntas» quedaba cortado sin aviso).
- **`npm run seal`:** recalcula las huellas de la CSP después de editar la app a mano. El build se detiene con un mensaje claro si hacen falta.
- **`npm run release`:** sella, actualiza la huella del README, arma y comprueba, en ese orden (dentro del release, `seal` ya no pide correr el build aparte).
- La huella de la CSP se calcula como la calcula el navegador (con los saltos de línea normalizados): un archivo guardado con CRLF en Windows ya no la rompe.
- `.gitattributes`: el archivo de la app no cambia de saltos de línea en ningún checkout, así su huella coincide con la publicada en cualquier sistema.
- `check-dist` (14 comprobaciones): créditos en las tres piezas, CSP válida también en la descarga, huellas publicadas, y los enlaces a otros sitios ya no se confunden con pedidos externos. El aviso de README con huella vieja sale solo con la app real, no con la réplica de prueba.
- `browser_test.py` (40 pruebas): funciona con la app real además de la réplica; prueba los créditos, su contraste en oscuro y el botón de copiar. Espera a la app sin `eval()`: antes, con la CSP real, fallaba o no según cuánto tardara en cargar.
- `serve.mjs` (solo local): `/..%2f` ya no sirve carpetas hermanas cuyo nombre empieza con «dist», y una dirección mal codificada ya no tira abajo el servidor.
- `vercel.json`: se suman `Strict-Transport-Security`, `Cross-Origin-Opener-Policy` y `Cross-Origin-Resource-Policy`.
- README de presentación con la huella de la descarga; documentación técnica en `docs/`.
- `engines.node` pasa a `>=22`: Node 20 ya no tiene soporte y Vercel lo dio de baja el 1 de octubre de 2026.
- Propuesta visual 2026-2027 en `docs/propuesta-2027/` (solo CSS, **no aplicada** en esta versión). Sus pasos están probados de punta a punta: con las tipografías y `font-src data:` el release pasa, las fuentes cargan con la CSP real y la descarga pesa 299 KB.

### Para pasar estos arreglos al código modular

Los cambios se hicieron sobre el archivo compilado. Si volvés a compilar desde `js/` y `content/`, aplicá lo mismo en:

| Arreglo | Dónde, en el código modular |
| --- | --- |
| 1 y 2 | La función que abre el Modo Emergencia (crea el `<dialog class="emergency">`): sumar un listener de `close` que, si ese diálogo sigue siendo el actual, llame a la función que lo cierra; esa función, al final, actualiza la clase `active` y el texto del botón `#em-btn` |
| 3 | El helper que abre hojas (`<dialog class="sheet">`): en el `click`, cerrar solo si las coordenadas caen fuera de `getBoundingClientRect()` del diálogo |
| 4 | `enableEncryption()` del store: borrar la clave vieja de `localStorage` solo si el backend activo no es el de `localStorage` |
| 5 | El helper que guarda el foco antes de redibujar: si el elemento es un radio, sumar `[value="…"]` al selector |
| 6 | Registrar también el evento `input` para los campos `data-change="plan.field"` (el handler ya es silencioso) |
| 7 | Estado del pilar Efectivo: tratar `cashOnHand === 0` sin productos como «none» |
| 8 | Handlers `contact.del` y `med.del`: confirmar con la misma hoja que usan los otros borrados |
| 9 | Handler `role.template`: filtrar las tareas que ya existen (misma situación y misma acción) |
| 10 y 11 | CSS: `.chipbtn { flex: none; }` y `.split > .badge:first-child { flex: 0 1 auto; }` |
| 12 | Plural de las unidades al listar la despensa; textos `mem.anon` y `sum.household` con `{people}` y `{pets}` ya pluralizados (`fmt.people_*`, `fmt.pets_*`) |
| Pie | `index.html`: `<footer class="app-foot">` dentro de `<main>`; en el arranque, completar `#app-version` con la versión y la del contenido |

## 2.0.0 — 15 de noviembre de 2026

Primera versión del sitio: landing con presentación y manual, PWA instalable en `/app/` y descarga del `.html` con su SHA-256.
