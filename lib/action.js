/**
 * El panel del boton de la barra: apariencia, mapa de la escena y ajustes de
 * la sala. Es el equivalente al dialogo de ajustes de la version de Foundry.
 */

import OBR from "../vendor/obr-sdk.js";
import {
  store, connect, isGM, resolveMap, setConfig, setSceneMap, setPieces, setReveal, DEFAULT_CONFIG
} from "./state.js";
import { prefs, setPrefs, send } from "./prefs.js";
import { openPanel, closePanel, refreshPanel } from "./panel.js";
import { esc } from "./geometry.js";

const ui = document.getElementById("ui");
const toggle = document.getElementById("toggle");

const MODES = {
  live:   "El mapa de la escena",
  pieces: "Revelado por piezas",
  image:  "Una imagen fija"
};

/** Un borrador local: lo que el GM esta eligiendo antes de guardar. */
let draft = null;

function render() {
  const p = prefs();
  const gm = isGM();
  const free = Number.isFinite(p.posX) && Number.isFinite(p.posY);
  const map = resolveMap();
  if (!draft) draft = { mode: map.own ? map.mode : "inherit", src: map.src || "" };

  toggle.textContent = p.open ? "Ocultar el minimapa" : "Mostrar el minimapa";
  toggle.classList.toggle("off", p.open);

  ui.innerHTML = `
    <h2>Apariencia</h2>
    <div class="row">
      <label for="dock">Esquina</label>
      <select id="dock">
        ${opts({ bottomLeft: "Abajo a la izquierda", topLeft: "Arriba a la izquierda",
                 bottomRight: "Abajo a la derecha", topRight: "Arriba a la derecha" }, p.dock)}
      </select>
    </div>
    ${free ? `<button id="resetPos" class="wide">Volver a la esquina</button>` : ""}
    <p class="hint">Puedes arrastrar el minimapa por su cabecera para ponerlo donde no estorbe.</p>
    <div class="row">
      <label for="width">Ancho</label>
      <input type="range" id="width" min="140" max="420" step="10" value="${p.width}">
      <span class="value">${p.width}</span>
    </div>
    <div class="row">
      <label for="height">Alto</label>
      <input type="range" id="height" min="100" max="380" step="10" value="${p.height}">
      <span class="value">${p.height}</span>
    </div>
    <div class="row">
      <label for="theme">Estilo</label>
      <select id="theme">${opts({ parchment: "Pergamino", dark: "Oscuro" }, p.theme)}</select>
    </div>
    <label class="opt"><input type="checkbox" id="fade" ${p.fade ? "checked" : ""}>
      <span>Atenuar cuando no se usa</span></label>
    <label class="opt"><input type="checkbox" id="showViewport" ${p.showViewport ? "checked" : ""}>
      <span>Mostrar el encuadre de la camara</span></label>

    <div class="gm-only" ${gm ? "" : "hidden"}>
      <hr>
      <h2>Mapa de esta escena</h2>
      <label class="opt"><input type="radio" name="mm" value="inherit" ${chk("inherit")}>
        <span>Lo que diga la sala <em>(${esc(MODES[store.config.mode] ?? "")})</em></span></label>
      ${Object.entries(MODES).map(([k, v]) => `
        <label class="opt"><input type="radio" name="mm" value="${k}" ${chk(k)}>
          <span>${esc(v)}</span></label>`).join("")}
      <div class="sub ${draft.mode === "image" ? "" : "off"}" id="imgSub">
        ${sharedMaps()}
        <button id="pick" class="wide">Elegir de mi biblioteca de Owlbear…</button>
        <input type="text" id="src" value="${esc(draft.src)}" placeholder="o pega aquí una URL">
      </div>
      <button id="save" class="primary" style="margin-top:6px">Guardar en esta escena</button>
      <p class="hint">Dos escenas con la misma imagen comparten lo revelado: las salas de
        un dungeon van juntas y el exterior lleva el suyo aparte.</p>

      <hr>
      <h2>Por defecto en la sala</h2>
      <div class="row">
        <label for="roomMode">Modo</label>
        <select id="roomMode">${opts(MODES, store.config.mode)}</select>
      </div>
      <div class="row">
        <label for="cols">Resolucion del revelado</label>
        <input type="range" id="cols" min="6" max="60" step="1" value="${store.config.cols}">
        <span class="value">${store.config.cols}</span>
      </div>
      <label class="opt"><input type="checkbox" id="playersEnabled" ${bool("playersEnabled")}>
        <span>Los jugadores pueden ver el minimapa</span></label>
      <label class="opt"><input type="checkbox" id="playersBackground" ${bool("playersBackground")}>
        <span>Los jugadores ven la imagen del mapa
          <em>— el minimapa no reproduce la niebla de guerra</em></span></label>
      <label class="opt"><input type="checkbox" id="autoReveal" ${bool("autoReveal")}>
        <span>Revelar la pieza donde esta el grupo</span></label>
    </div>`;

  wire();
}

const chk = v => (draft.mode === v ? "checked" : "");
const bool = k => (store.config[k] ? "checked" : "");

const opts = (map, current) => Object.entries(map)
  .map(([k, v]) => `<option value="${k}" ${k === current ? "selected" : ""}>${esc(v)}</option>`)
  .join("");

/**
 * Los mapas que ya tienen revelado guardado en esta sala. Elegir uno de aqui
 * es, justamente, compartirlo con las escenas que ya lo usan.
 */
function sharedMaps() {
  const used = Object.keys(store.reveal ?? {}).filter(Boolean);
  if (store.config.src && !used.includes(store.config.src)) used.push(store.config.src);
  if (!used.length) return "";
  return `<select id="shared">
    <option value="">— Compartir un mapa ya en uso —</option>
    ${used.map(u => `<option value="${esc(u)}" ${u === draft.src ? "selected" : ""}>
      ${esc(decodeURIComponent(u.split("/").pop().split("?")[0]).slice(0, 40))}</option>`).join("")}
  </select>`;
}

/* -------------------------------------------- */

function wire() {
  const on = (id, ev, fn) => document.getElementById(id)?.addEventListener(ev, fn);

  // Apariencia: se aplica al momento; el tamano y la esquina obligan a
  // reabrir el popover, porque eso lo decide Owlbear al crearlo.
  on("dock", "change", e => {
    // Elegir esquina descarta la posicion libre: si no, no pasaria nada.
    setPrefs({ dock: e.target.value, posX: null, posY: null });
    if (prefs().open) refreshPanel();
    render();
  });
  on("resetPos", "click", () => {
    setPrefs({ posX: null, posY: null });
    if (prefs().open) refreshPanel();
    render();
  });
  on("theme", "change", e => { setPrefs({ theme: e.target.value }); });
  on("fade", "change", e => setPrefs({ fade: e.target.checked }));
  on("showViewport", "change", e => setPrefs({ showViewport: e.target.checked }));

  for (const key of ["width", "height"]) {
    const el = document.getElementById(key);
    el?.addEventListener("input", e => {
      e.target.nextElementSibling.textContent = e.target.value;
    });
    el?.addEventListener("change", e => {
      setPrefs({ [key]: Number(e.target.value) });
      if (prefs().open) refreshPanel();
    });
  }

  // Mapa de esta escena
  document.querySelectorAll('input[name="mm"]').forEach(r => {
    r.addEventListener("change", e => {
      draft.mode = e.target.value;
      document.getElementById("imgSub")?.classList.toggle("off", draft.mode !== "image");
    });
  });
  on("src", "input", e => { draft.src = e.target.value.trim(); });
  on("shared", "change", e => {
    if (!e.target.value) return;
    draft.src = e.target.value;
    document.getElementById("src").value = e.target.value;
  });
  on("pick", "click", async () => {
    // Abre la biblioteca de imagenes de Owlbear. Si se cierra sin elegir,
    // segun la version devuelve una lista vacia o rechaza la promesa.
    try {
      const [image] = (await OBR.assets.downloadImages(false, "", "MAP")) ?? [];
      if (!image) return;
      draft.src = image.image.url;
      document.getElementById("src").value = draft.src;
    } catch { /* cancelado */ }
  });
  on("save", "click", async () => {
    if (draft.mode === "image" && !draft.src) {
      return OBR.notification.show("Elige una imagen para el mapa.", "WARNING");
    }
    if (draft.mode === "inherit") await setSceneMap(null);
    else await setSceneMap({ mode: draft.mode, src: draft.mode === "image" ? draft.src : "" });
    send({ type: "refresh" });
    OBR.notification.show("Mapa guardado en esta escena.", "SUCCESS");
  });

  // Ajustes de la sala
  on("roomMode", "change", e => setConfig({ mode: e.target.value }));
  const cols = document.getElementById("cols");
  cols?.addEventListener("input", e => { e.target.nextElementSibling.textContent = e.target.value; });
  cols?.addEventListener("change", e => setConfig({ cols: Number(e.target.value) }));
  for (const key of ["playersEnabled", "playersBackground", "autoReveal"]) {
    on(key, "change", e => setConfig({ [key]: e.target.checked }));
  }
}

toggle.addEventListener("click", async () => {
  const open = !prefs().open;
  setPrefs({ open });
  if (open) await openPanel();
  else await closePanel();
  render();
});

/* -------------------------------------------- */

OBR.onReady(async () => {
  await applyTheme();
  OBR.theme.onChange(applyTheme);
  await connect(() => { draft = null; render(); });
  render();
});

/** El panel usa los colores del tema de Owlbear para no desentonar. */
async function applyTheme() {
  try {
    const t = await OBR.theme.getTheme();
    const s = document.documentElement.style;
    s.setProperty("--bg", t.background.paper);
    s.setProperty("--text", t.text.primary);
    s.setProperty("--muted", t.text.secondary);
    s.setProperty("--accent", t.primary.main);
    s.setProperty("--field", t.mode === "DARK" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)");
    s.setProperty("--field-hover", t.mode === "DARK" ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.12)");
    s.setProperty("--line", t.mode === "DARK" ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.14)");
  } catch {}
}
