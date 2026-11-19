/* FamSurvivor — landing. Tres cosas, sin dependencias y sin pedidos de red:
 *   1. El medidor de la portada: una versión simplificada del cálculo de autonomía de la app.
 *   2. Abrir primero las instrucciones de instalación que corresponden al dispositivo de quien visita.
 *   3. Copiar la huella SHA-256 de la descarga con un toque.
 * Sin JavaScript la página se lee completa: el medidor queda con los valores de ejemplo, todas las
 * instrucciones abiertas y la huella seleccionable a mano. */
(() => {
  "use strict";

  // ---------- 1. medidor ----------
  // Hogar de ejemplo = 2 adultos + 1 niño de 4 a 8 años, sin calor extremo, nivel de agua «Mínimo».
  // Valores de la app (content/catalog.js): adulto 3 L para beber + 1 L para cocinar; niño de 4 a 8, 2 + 1 L.
  // Comida: 2.100 + 2.100 + 1.400 kcal por día; una ración = 700 kcal.
  const HOME = { waterPerDay: 4 + 4 + 3, kcalPerDay: 2100 + 2100 + 1400, ration: 700, bidonL: 6, medsPerDay: 1, target: 3 };

  const nf = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });
  // La app redondea los días hacia abajo, a un decimal.
  const floorTenth = (x) => Math.floor(x * 10 + 1e-9) / 10;
  const plural = (n, one, many) => (n === 1 ? one : many);
  const daysText = (d) => `${nf.format(d)} ${plural(d, "día", "días")}`;

  const $ = (id) => document.getElementById(id);
  const gauge = $("gauge");
  if (gauge) {
    const inputs = { agua: $("r-agua"), comida: $("r-comida"), meds: $("r-meds") };
    const rows = [...gauge.querySelectorAll(".res")];
    let liveTimer = 0;

    const compute = () => {
      const bidones = Number(inputs.agua.value);
      const raciones = Number(inputs.comida.value);
      const pastillas = Number(inputs.meds.value);
      const days = {
        agua: floorTenth((bidones * HOME.bidonL) / HOME.waterPerDay),
        comida: floorTenth((raciones * HOME.ration) / HOME.kcalPerDay),
        meds: floorTenth(pastillas / HOME.medsPerDay),
      };
      // Igual que la app: gana el primero con el menor valor.
      const order = ["agua", "comida", "meds"];
      const weakest = order.reduce((a, b) => (days[b] < days[a] ? b : a));
      const total = days[weakest];

      const missing = {
        agua: () => {
          const liters = Math.max(0, Math.ceil(HOME.waterPerDay * HOME.target - bidones * HOME.bidonL));
          const count = Math.ceil(liters / HOME.bidonL);
          return `${nf.format(liters)} L de agua (unos ${count} ${plural(count, "bidón", "bidones")} de ${HOME.bidonL} L)`;
        },
        comida: () => {
          const n = Math.max(0, Math.ceil((HOME.kcalPerDay * HOME.target) / HOME.ration - raciones));
          return `${nf.format(n)} ${plural(n, "ración", "raciones")} de comida lista para comer`;
        },
        meds: () => {
          const n = Math.max(0, Math.ceil(HOME.medsPerDay * HOME.target - pastillas));
          return `${nf.format(n)} ${plural(n, "unidad", "unidades")} de medicación`;
        },
      };

      return { bidones, raciones, pastillas, days, weakest, total, covered: total >= HOME.target, missing };
    };

    const render = () => {
      const s = compute();

      $("g-days").textContent = nf.format(s.total);
      $("g-unit").textContent = plural(s.total, "día", "días");
      const status = $("g-status");
      status.className = `badge ${s.covered ? "ok" : "warn"}`;
      status.querySelector("use").setAttribute("href", s.covered ? "#i-check" : "#i-clock");
      $("g-status-text").textContent = s.covered ? `Cubrís tu meta de ${HOME.target} días` : `Tu meta es de ${HOME.target} días`;

      $("v-agua").textContent = `${s.bidones} ${plural(s.bidones, "bidón", "bidones")} de ${HOME.bidonL} L`;
      $("v-comida").textContent = `${s.raciones} ${plural(s.raciones, "ración", "raciones")} de ${HOME.ration} kcal`;
      $("v-meds").textContent = `${s.pastillas} ${plural(s.pastillas, "pastilla", "pastillas")}, una por día`;

      for (const row of rows) {
        const key = row.dataset.res;
        const d = s.days[key];
        $(`d-${key}`).textContent = daysText(d);
        const bar = row.querySelector(".bar");
        bar.classList.toggle("short", d < HOME.target);
        bar.querySelector(".fill").style.width = `${Math.max(0, Math.min(100, Math.round((d / HOME.target) * 100)))}%`;
        // Solo se marca el eslabón débil cuando de verdad no llega a la meta (igual que la app).
        row.querySelector(".weak").hidden = !(key === s.weakest && !s.covered);
      }

      const missingEl = $("g-missing");
      missingEl.textContent = s.covered ? "" : `Te falta: ${s.missing[s.weakest]()}`;

      // Anuncio para lectores de pantalla, sin hablar en cada paso del deslizador.
      clearTimeout(liveTimer);
      liveTimer = setTimeout(() => {
        const names = { agua: "el agua", comida: "la comida", meds: "la medicación" };
        $("g-live").textContent = s.covered
          ? `Autonomía: ${daysText(s.total)}. Cubrís tu meta de ${HOME.target} días.`
          : `Autonomía: ${daysText(s.total)}. El eslabón más débil es ${names[s.weakest]}. Te falta: ${s.missing[s.weakest]()}.`;
      }, 600);
    };

    for (const input of Object.values(inputs)) input.addEventListener("input", render);
    render();
  }

  // ---------- 2. instrucciones según el dispositivo ----------
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const platform = isIOS ? "ios" : isAndroid ? "android" : "desktop";
  document.documentElement.dataset.platform = platform;

  const open = (id, value) => {
    const el = $(id);
    if (el) el.open = value;
  };
  if (platform === "ios") {
    open("inst-android", false);
    open("inst-desktop", false);
  } else if (platform === "android") {
    open("inst-ios", false);
    open("inst-desktop", false);
  }

  // ---------- 3. verificación: copiar la huella y mostrar la dirección real en el comando de auditoría ----------
  for (const el of document.querySelectorAll("[data-origin]")) el.textContent = location.origin;

  const live = document.createElement("p");
  live.className = "sr-only";
  live.setAttribute("role", "status");
  document.body.appendChild(live);

  if (navigator.clipboard && window.isSecureContext) {
    for (const button of document.querySelectorAll("button[data-copy]")) {
      const target = $(button.dataset.copy);
      const label = button.querySelector("span");
      if (!target || !label) continue;
      const original = label.textContent;
      let timer = 0;
      button.hidden = false;
      button.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(target.textContent.trim());
          label.textContent = "Copiada";
          button.dataset.done = "";
          live.textContent = "Huella copiada al portapapeles.";
        } catch {
          live.textContent = "No se pudo copiar: seleccioná la huella y copiala a mano.";
        }
        clearTimeout(timer);
        timer = setTimeout(() => {
          label.textContent = original;
          delete button.dataset.done;
        }, 2500);
      });
    }
  }
})();
