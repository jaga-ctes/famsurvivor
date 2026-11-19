# Publicar FamSurvivor: GitHub + Vercel, paso a paso

Repositorio: **https://github.com/jaga-ctes/famsurvivor** · Comandos pensados para Linux (Linux Mint, Ubuntu); en macOS son iguales.

## 0. Antes de empezar (una sola vez)

```bash
git --version          # si no está: sudo apt install git
node --version         # tiene que decir v22 o más
```

Si `node` dice v18 o v20, actualizalo con nvm (Node 20 ya no tiene soporte):

```bash
nvm install --lts
nvm alias default 'lts/*'
node --version
```

Configurá tu identidad de git (usá el mismo correo de tu cuenta de GitHub, o el `…@users.noreply.github.com` que GitHub te da en *Settings → Emails*):

```bash
git config --global user.name "Gonzalo"
git config --global user.email "TU_CORREO"
git config --global init.defaultBranch main
```

Para autenticarte, lo más simple es la CLI de GitHub (`gh`): guarda las credenciales y git las usa solo.

```bash
sudo apt install gh      # o seguí https://cli.github.com
gh auth login            # GitHub.com → HTTPS → «Login with a web browser»
gh auth setup-git
```

GitHub no acepta tu contraseña para `git push`: hace falta `gh`, un token o una clave SSH.

## 1. Preparar la carpeta y probar

```bash
cd ~/Proyectos                                   # o donde guardes tus proyectos
unzip ~/Descargas/famsurvivor-site_v2.0.1.zip
cd famsurvivor
npm run release      # sella la CSP, pone la huella en el README, arma dist/ y corre las 14 comprobaciones
npm run serve        # abrí http://localhost:4173 y revisá el sitio y /app/ (Ctrl+C para cortar)
```

`npm run release` tiene que terminar con «Las 14 comprobaciones de dist/ pasaron.». Anotá la huella `sha256` que imprime para `FamSurvivor-v2.html`: es la que van a mostrar el README, el sitio y GitHub.

## 2. Crear el repositorio en GitHub

Si `jaga-ctes/famsurvivor` todavía no existe, creálo **vacío** (sin README, sin .gitignore y sin licencia: ya vienen en la carpeta).

Con la terminal:

```bash
gh repo create jaga-ctes/famsurvivor --public \
  --description "Autoprotección del hogar: autonomía en días, plan familiar y Modo Emergencia. Sin conexión y sin cuentas."
```

O desde la web: <https://github.com/new> → *Owner:* `jaga-ctes` → *Repository name:* `famsurvivor` → *Public* → sin tildar nada → *Create repository*.

> `jaga-ctes` tiene que ser tu usuario o una organización donde puedas crear repositorios.

## 3. Primer commit y subida

Desde la carpeta `famsurvivor`:

```bash
git init
git add .
git status            # revisá: NO tienen que aparecer dist/ ni dist-test/ (los arma Vercel)
git commit -m "FamSurvivor 2.0.1: sitio, app instalable y verificación SHA-256"
git remote add origin https://github.com/jaga-ctes/famsurvivor.git
git push -u origin main
```

**Si el repositorio ya tenía un README** creado desde la web, el `push` falla. Traé ese commit, quedate con tus archivos y volvé a subir:

```bash
git pull origin main --allow-unrelated-histories --no-rebase -X ours
git push -u origin main
```

## 4. Comprobar que GitHub tiene exactamente el archivo publicado

```bash
curl -sL https://raw.githubusercontent.com/jaga-ctes/famsurvivor/main/source/famsurvivor_standalone.html | sha256sum
```

Tiene que dar la misma huella del paso 1. Gracias a `.gitattributes`, el archivo de la app no cambia de saltos de línea en ningún sistema, así que quien clone el repositorio obtiene la misma huella.

## 5. Publicar el sitio en Vercel

1. Entrá a <https://vercel.com> con tu cuenta de GitHub → **Add New… → Project**.
2. En **Import Git Repository** elegí `jaga-ctes/famsurvivor`. Si no aparece: **Adjust GitHub App Permissions** e instalá la app de Vercel en `jaga-ctes` con acceso a ese repositorio.
3. **Framework Preset: Other.** No toques *Build Command* ni *Output Directory*: ya vienen en `vercel.json` (`node tools/build.mjs && node tests/check-dist.mjs` y `dist`).
4. **Deploy.** En el registro del build tienen que aparecer las cuatro huellas y «Las 14 comprobaciones de dist/ pasaron.». Si una falla, Vercel no publica.
5. *Settings → Build and Deployment → Node.js Version:* dejá la que viene (24.x o más nueva).
6. *Settings → Deployment Protection:* dejá **Standard Protection**. El dominio de producción (`famsurvivor.vercel.app` o el tuyo) queda público; lo que pide login son las direcciones largas de cada deploy (`famsurvivor-abc123….vercel.app`). **Compartí siempre la dirección corta.** Si el dominio corto te pide login, el alcance está en *All Deployments*: cambialo a *Standard Protection*.
7. *Opcional:* *Settings → Domains* → agregá un subdominio propio (por ejemplo `famsurvivor.jagasoluciones.com`) y creá en tu DNS el registro que Vercel te indique. El HTTPS lo pone Vercel.
8. En GitHub, en la página del repositorio, tocá el engranaje de **About** → *Website*: pegá la dirección del sitio. Sumá *topics* como `pwa`, `offline-first`, `local-first`, `emergency-preparedness`, `argentina`.

## 6. Comprobar el sitio publicado

```bash
SITIO=https://famsurvivor.vercel.app        # tu dirección de producción

curl -sL "$SITIO/descargas/FamSurvivor-v2.html" | sha256sum   # = huella del paso 1
curl -s  "$SITIO/descargas/SHA256SUMS.txt"
curl -s  "$SITIO/app/" | sha256sum                             # = huella de /app/ en la sección «Verificar»
curl -sI "$SITIO/" | grep -iE "strict-transport|x-frame|content-security|referrer"
```

Después, en el teléfono: abrí el sitio en **Chrome (Android)** y en **Safari (iPhone)**, instalá la app, cerrala, poné el modo avión y volvé a abrirla. Tiene que funcionar sin conexión y mostrar «Diseñado por Jagā Soluciones Informáticas» al final de cada pestaña.

## 7. Crear la versión en GitHub (recomendado)

Una *release* deja el archivo para descargar junto al código, con su huella. GitHub calcula y muestra el SHA-256 de cada archivo adjunto, así que hay una tercera fuente para comparar, además del sitio y el README.

```bash
npm run build
git tag -a v2.0.1 -m "FamSurvivor 2.0.1"
git push origin v2.0.1
gh release create v2.0.1 dist/descargas/FamSurvivor-v2.html dist/descargas/SHA256SUMS.txt \
  --title "FamSurvivor 2.0.1" \
  --notes "Pie con los créditos en la app y la descarga, sección «Verificar» con las huellas SHA-256 y 12 errores corregidos. Detalle en CHANGELOG.md."
```

## 8. Cada vez que saques una versión nueva

1. Reemplazá o editá `source/famsurvivor_standalone.html`.
2. Si cambió la versión de la app o del contenido, actualizala en el código de la app y en `site.config.json` (`appVersion`, `contentVersion`, `contentReviewed`). El build se detiene si no coinciden.
3. `npm run release` (sella la CSP, actualiza la huella del README, arma y comprueba).
4. Sumá lo que cambió a `CHANGELOG.md`.
5. Subí los cambios:

   ```bash
   git add -A
   git commit -m "FamSurvivor 2.0.2: …"
   git push
   ```

   Vercel publica solo. Quien tenga la app instalada ve «Hay una versión nueva» y actualiza con un toque; sus datos no se tocan.
6. Etiqueta y *release* como en el paso 7, con el número nuevo.

## Licencia (decisión tuya)

El repositorio sale **sin archivo de licencia**, así que por defecto el código queda con todos los derechos reservados: se puede ver y descargar, pero no reutilizar. Si querés que sea código abierto, agregá una licencia desde GitHub (*Add file → Create new file → `LICENSE` → Choose a license template*). Las más comunes: **MIT** (cualquiera puede reutilizarlo, también en productos cerrados) o **AGPL-3.0** (quien lo modifique y lo publique tiene que compartir sus cambios). Las tipografías (SIL OFL) y axe-core (MPL 2.0) mantienen sus licencias en cualquier caso.
