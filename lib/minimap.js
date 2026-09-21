/**
 * El minimapa.
 *
 * Tres modos, los mismos que en la version de Foundry:
 *   live   -> el mapa de la escena tal cual, con tokens y encuadre
 *   pieces -> las piezas del mapa reveladas una a una
 *   image  -> una imagen fija revelada con una rejilla
 *
 * Se dibuja con elementos absolutos dentro de un marco de tamano fijo: al
 * hacer zoom se redibuja en vez de escalar con CSS, para que los puntos de los
 * tokens y el rectangulo del encuadre no se inflen con la ampliacion.
 */

import OBR from "../vendor/obr-sdk.js";
import {
  store, connect, isGM, canSee, canSeeBackground,
  resolveMap, revealFor, piecesState, setReveal, setPieces
} from "./state.js";
import { prefs, setPrefs, onMessage } from "./prefs.js";
import { PANEL_ID } from "./panel.js";
import {
  imageBounds, unionBounds, makeTransform, canvasOffset, esc, clamp, debounce
} from "./geometry.js";

const root = document.getElementById("root");

/* El panel ocupa el iframe entero; el marco es lo que queda al quitar la
   cabecera. Se mide sobre la ventana real y no sobre las preferencias, por si
   Owlbear nos da un tamano algo distinto del pedido. */
const CHROME_W = 12;
const CHROME_H = 38;
const frameW = () => Math.max(60, window.innerWidth - CHROME_W);
const frameH = () => Math.max(60, window.innerHeight - CHROME_H);

let T = null;          // transformacion mundo <-> minimapa del ultimo dibujo
let mode = "live";
let grid = null;       // rejilla del modo imagen: { cols, rows, cw, ch, total }
let camera = null;     // encuadre en coordenadas de mundo
let viewSize = { w: 1920, h: 1080 };

/* -------------------------------------------- */
/*  Seleccion de items                          */
/* -------------------------------------------- */

const mapItems = () => store.items
  .filter(i => i.type === "IMAGE" && i.layer === "MAP")
  .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

const tokenItems = () => store.items
  .filter(i => i.layer === "CHARACTER" || i.layer === "MOUNT");

/** Los tokens que un jugador puede ver. Un item oculto es solo del GM. */
const visibleTokens = () => isGM() ? tokenItems() : tokenItems().filter(i => i.visible);

/**
 * Owlbear no tiene disposiciones (amistoso, hostil...), asi que el color del
 * punto es el del jugador que puso el token, que es la nocion de pertenencia
 * que si existe aqui. Lo que no tiene dueno entre los presentes sale neutro.
 */
function dotColor(item) {
  const player = store.players.find(p => p.id === item.createdUserId);
  if (player) return player.color;
  if (item.createdUserId === store.playerId) return store.playerColor;
  return "#d7c25a";
}

/* -------------------------------------------- */
/*  Dibujo                                      */
/* -------------------------------------------- */

function render() {
  const p = prefs();
  root.className = `mm-root mm-theme-${p.theme}${p.fade ? " mm-fade" : ""}`;
  root.style.height = "100vh";

  if (!canSee()) {
    root.innerHTML = `<p class="mm-empty">El master ha desactivado el minimapa.</p>`;
    return;
  }
  if (!store.ready) {
    root.innerHTML = toolbar() + `<p class="mm-empty">No hay ninguna escena abierta</p>`;
    wireToolbar();
    return;
  }

  const map = resolveMap();
  mode = map.mode;

  const body = mode === "image" ? renderImage(map.src) : renderPieces(mode);
  root.innerHTML = toolbar() + body;

  wireToolbar();
  if (mode === "image") layoutImage(map.src);
  else wireMap();
  wireView();
}

/* --- Modos live y pieces ------------------------------- */

function renderPieces(mode) {
  const st = piecesState();
  const items = mapItems().filter(i => !st.excluded.has(i.id));
  const boxes = items.map(i => imageBounds(i, store.dpi));
  const box = unionBounds(boxes);

  if (!box) {
    return `<p class="mm-empty">${isGM()
      ? "Esta escena no tiene imagenes en la capa de mapa"
      : "El mapa aun no esta preparado"}</p>`;
  }

  const p = prefs();
  T = makeTransform(box, frameW(), frameH(), p.zoom);

  const showBg = canSeeBackground();
  const pieces = items.map((item, i) => {
    const revealed = mode === "live" || st.revealed.has(item.id);
    const hidden = !item.visible;
    // Al jugador no se le manda lo que no puede ver: ni lo oculto en la escena
    // ni lo que aun no se ha revelado.
    if (!isGM() && (!revealed || hidden)) return "";
    if (!showBg) return "";

    const b = boxes[i];
    const at = T.toMap(b.x, b.y);
    const w = b.w * T.scale;
    const h = b.h * T.scale;

    // El item gira alrededor de su `position`, no de su centro.
    let transform = "";
    if (item.rotation) {
      const o = T.toMap(item.position.x, item.position.y);
      transform = ` transform-origin:${(o.x - at.x).toFixed(1)}px ${(o.y - at.y).toFixed(1)}px;`
        + ` transform:rotate(${item.rotation}deg);`;
    }

    const cls = [
      revealed ? "" : "mm-veiled",
      st.current === item.id ? "mm-current" : ""
    ].filter(Boolean).join(" ");

    return `<img class="mm-piece ${cls}" data-piece="${esc(item.id)}" alt=""`
      + ` src="${esc(item.image.url)}" title="${esc(item.name)}"`
      + ` style="left:${at.x.toFixed(1)}px; top:${at.y.toFixed(1)}px;`
      + ` width:${w.toFixed(1)}px; height:${h.toFixed(1)}px; opacity:${item.visible ? 1 : 0.6};${transform}">`;
  }).join("");

  const dots = visibleTokens().map(item => {
    const at = T.toMap(item.position.x, item.position.y);
    if (at.x < -20 || at.y < -20 || at.x > T.w + 20 || at.y > T.h + 20) return "";
    const cls = [
      store.selection?.includes(item.id) ? "mm-selected" : "",
      item.visible ? "" : "mm-dim"
    ].filter(Boolean).join(" ");
    return `<span class="mm-dot ${cls}" title="${esc(item.name)}"`
      + ` style="left:${at.x.toFixed(1)}px; top:${at.y.toFixed(1)}px; background:${esc(dotColor(item))}"></span>`;
  }).join("");

  const vp = prefs().showViewport ? viewportDiv() : "";
  const cls = `${mode === "pieces" ? "mm-items" : "mm-scene"} ${isGM() ? "mm-gm" : ""}`
    + `${showBg ? "" : " mm-noimage"}`;
  return frame(pieces + vp + dots, cls);
}

/** El rectangulo con la parte del tablero que se esta viendo. */
function viewportDiv() {
  if (!camera || !T) return "";
  const a = T.toMap(camera.x, camera.y);
  const w = camera.w * T.scale;
  const h = camera.h * T.scale;
  return `<div class="mm-viewport" style="left:${a.x.toFixed(1)}px; top:${a.y.toFixed(1)}px;`
    + ` width:${w.toFixed(1)}px; height:${h.toFixed(1)}px"></div>`;
}

/* --- Modo imagen --------------------------------------- */

function renderImage(src) {
  if (!src) {
    return `<p class="mm-empty">${isGM()
      ? "Elige una imagen de mapa en los ajustes"
      : "El master aun no ha puesto el mapa"}</p>`;
  }
  const m = revealFor(src).marker;
  const marker = m
    ? `<span class="mm-marker" style="left:${(m.x * 100).toFixed(2)}%; top:${(m.y * 100).toFixed(2)}%"></span>`
    : "";
  // 0x0 de momento: las medidas salen del tamano natural de la imagen, que
  // solo se conoce cuando ha cargado (ver layoutImage).
  return frame(
    `<img class="mm-bg" src="${esc(src)}" alt=""><div class="mm-mask"></div>${marker}`,
    `mm-image ${isGM() ? "mm-gm" : ""}`, 0, 0
  );
}

function frame(inner, cls, cw, ch) {
  const p = prefs();
  const w = cw ?? (T?.w ?? frameW());
  const h = ch ?? (T?.h ?? frameH());
  const o = canvasOffset(frameW(), frameH(), w, h, { x: p.panX, y: p.panY });
  return `
    <div class="mm-frame ${cls}" style="width:${frameW()}px; height:${frameH()}px">
      <div class="mm-canvas" style="width:${w}px; height:${h}px; left:${o.x}px; top:${o.y}px">${inner}</div>
    </div>`;
}

/* -------------------------------------------- */
/*  Cabecera                                    */
/* -------------------------------------------- */

/* Iconos en linea: los emoji cambian de aspecto en cada sistema y alguno sale
   directamente ridiculo. Estos heredan el color del texto del tema. */
const svg = d => `<svg viewBox="0 0 24 24" width="11" height="11" fill="none"
  stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"
  style="display:block;margin:auto">${d}</svg>`;

const ICON = {
  eye:      svg('<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.6"/>'),
  eyeOff:   svg('<path d="M3 3l18 18"/><path d="M10.6 6.1C11.05 6.03 11.5 6 12 6c6.5 0 10 6 10 6a18 18 0 0 1-3.2 3.9"/><path d="M6.3 8.1A18 18 0 0 0 2 12s3.5 6 10 6c1.2 0 2.3-.2 3.3-.5"/>'),
  pin:      svg('<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.4"/>'),
  compress: svg('<path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6"/>'),
  gear:     svg('<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 15a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 8.5l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9 3.1V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.3z"/>'),
  undo:     svg('<path d="M3 3v6h6"/><path d="M3.5 9a9 9 0 1 1 1.6 7"/>'),
  close:    svg('<path d="M5 5l14 14M19 5L5 19"/>')
};

function toolbar() {
  const p = prefs();
  const moved = p.zoom !== 1 || p.panX || p.panY;
  const st = piecesState();
  const gm = isGM();
  const btn = (action, icon, title, extra = "") =>
    `<button class="mm-btn ${extra}" data-do="${action}" title="${esc(title)}">${icon}</button>`;

  let tools = "";
  if (gm && (mode === "pieces" || mode === "image")) {
    tools += btn("revealAll", ICON.eye, "Revelar todo")
           + btn("hideAll", ICON.eyeOff, "Ocultar todo");
  }
  if (gm && mode === "pieces" && st.excluded.size) {
    tools += btn("restore", ICON.undo, `Devolver al plano ${st.excluded.size} pieza(s)`, "mm-btn-warn");
  }
  if (gm && mode === "image") {
    tools += btn("clearMarker", ICON.pin, "Quitar el marcador del grupo");
  }
  if (moved) tools += btn("resetView", ICON.compress, "Volver al encuadre completo");

  return `<div class="mm-toolbar">
    <span class="mm-title">${esc(label())}</span>
    ${tools}
    ${gm ? btn("settings", ICON.gear, "Ajustes del minimapa") : ""}
    ${btn("close", ICON.close, "Cerrar el minimapa")}
  </div>`;
}

function label() {
  if (mode === "image") return "Mapa";
  if (mode === "pieces") {
    const st = piecesState();
    const total = mapItems().filter(i => !st.excluded.has(i.id)).length;
    return `Explorado ${st.revealed.size}/${total}`;
  }
  return "Minimapa";
}

/* -------------------------------------------- */
/*  Interaccion                                 */
/* -------------------------------------------- */

function wireToolbar() {
  root.querySelectorAll("[data-do]").forEach(b => {
    b.addEventListener("click", ev => {
      ev.stopPropagation();
      actions[b.dataset.do]?.();
    });
  });
}

const actions = {
  close: async () => {
    setPrefs({ open: false });   // si no, vuelve a abrirse al recargar la sala
    await OBR.popover.close(PANEL_ID).catch(() => {});
  },
  settings: () => OBR.action.open().catch(() => {}),
  resetView: () => { setPrefs({ zoom: 1, panX: 0, panY: 0 }); render(); },
  restore: () => setPieces({ excluded: [] }),
  revealAll: () => {
    if (mode === "pieces") {
      const st = piecesState();
      return setPieces({ revealed: mapItems().filter(i => !st.excluded.has(i.id)).map(i => i.id) });
    }
    if (grid) return setReveal(resolveMap().src, { cells: Array.from({ length: grid.total }, (_, i) => i) });
  },
  hideAll: () => {
    if (mode === "pieces") return setPieces({ revealed: [], current: null });
    return setReveal(resolveMap().src, { cells: [] });
  },
  clearMarker: () => setReveal(resolveMap().src, { marker: null })
};

/** Clic en el mapa: mueve la camara. Clic en una pieza (GM): la revela. */
function wireMap() {
  const frameEl = root.querySelector(".mm-frame");
  const cv = root.querySelector(".mm-canvas");
  if (!frameEl || !cv) return;

  frameEl.addEventListener("click", async ev => {
    if (ev.shiftKey || !T) return;             // shift+arrastrar es desplazar

    const piece = ev.target.closest?.(".mm-piece");
    if (piece && isGM() && mode === "pieces") {
      const id = piece.dataset.piece;
      const st = piecesState();
      if (ev.altKey) {                          // sacar del plano
        st.excluded.add(id);
        st.revealed.delete(id);
        return setPieces({ excluded: st.excluded, revealed: st.revealed });
      }
      if (st.revealed.has(id)) st.revealed.delete(id);
      else st.revealed.add(id);
      return setPieces({ revealed: st.revealed });
    }

    // Las coordenadas se miden sobre el lienzo, no sobre el marco, para que
    // sigan siendo correctas con cualquier zoom o desplazamiento.
    const r = cv.getBoundingClientRect();
    const world = T.toWorld(ev.clientX - r.left, ev.clientY - r.top);
    await centerOn(world);
  });
}

/** Rueda para el zoom, shift+arrastrar (o boton central) para desplazar. */
function wireView() {
  const frameEl = root.querySelector(".mm-frame");
  const cv = root.querySelector(".mm-canvas");
  if (!frameEl || !cv) return;

  frameEl.addEventListener("wheel", ev => {
    ev.preventDefault();
    const p = prefs();
    const zoom = clamp(p.zoom * (ev.deltaY < 0 ? 1.2 : 1 / 1.2), 1, 8);
    if (zoom === p.zoom) return;
    const reset = zoom === 1;     // al volver a la vista completa, sin paneo
    setPrefs({ zoom, panX: reset ? 0 : p.panX, panY: reset ? 0 : p.panY });
    render();
  }, { passive: false });

  let pan = null;
  frameEl.addEventListener("pointerdown", ev => {
    if (!(ev.button === 1 || (ev.button === 0 && ev.shiftKey))) return;
    ev.preventDefault();
    const p = prefs();
    pan = { sx: ev.clientX, sy: ev.clientY, ox: p.panX, oy: p.panY, x: p.panX, y: p.panY };
    frameEl.setPointerCapture(ev.pointerId);
    frameEl.classList.add("mm-panning");
  });

  frameEl.addEventListener("pointermove", ev => {
    if (!pan) return;
    pan.x = pan.ox + (ev.clientX - pan.sx);
    pan.y = pan.oy + (ev.clientY - pan.sy);
    // Se mueve el lienzo directamente; solo se guarda al soltar.
    const o = canvasOffset(frameW(), frameH(), cv.offsetWidth, cv.offsetHeight, pan);
    cv.style.left = `${o.x}px`;
    cv.style.top = `${o.y}px`;
  });

  const endPan = () => {
    if (!pan) return;
    const { x, y } = pan;
    pan = null;
    frameEl.classList.remove("mm-panning");
    setPrefs({ panX: x, panY: y });
  };
  frameEl.addEventListener("pointerup", endPan);
  frameEl.addEventListener("pointercancel", endPan);
}

/**
 * Rejilla de revelado del modo imagen. Hay que esperar a que la imagen cargue
 * porque su proporcion decide cuantas filas caben.
 */
async function layoutImage(src) {
  const frameEl = root.querySelector(".mm-frame.mm-image");
  const cv = frameEl?.querySelector(".mm-canvas");
  const img = frameEl?.querySelector(".mm-bg");
  const mask = frameEl?.querySelector(".mm-mask");
  if (!frameEl || !cv || !img || !mask) return;

  if (!img.complete) {
    await new Promise(res => {
      img.addEventListener("load", res, { once: true });
      img.addEventListener("error", res, { once: true });
    });
  }

  const p = prefs();
  const nw = img.naturalWidth || 1000;
  const nh = img.naturalHeight || 1000;
  const scale = Math.min(frameW() / nw, frameH() / nh) * p.zoom;
  const w = Math.max(20, Math.round(nw * scale));
  const h = Math.max(20, Math.round(nh * scale));
  const o = canvasOffset(frameW(), frameH(), w, h, { x: p.panX, y: p.panY });
  Object.assign(cv.style, { width: `${w}px`, height: `${h}px`, left: `${o.x}px`, top: `${o.y}px` });

  // Celdas cuadradas: el numero de filas sale de la proporcion.
  const cols = store.config.cols;
  const cw = w / cols;
  const rows = Math.max(1, Math.round(h / cw));
  const ch = h / rows;
  grid = { cols, rows, cw, ch, total: cols * rows };

  const cellHTML = i => {
    const c = i % cols, r = Math.floor(i / cols);
    return `<span class="mm-cell" data-i="${i}" style="left:${(c * cw).toFixed(1)}px;`
      + ` top:${(r * ch).toFixed(1)}px; width:${Math.ceil(cw)}px; height:${Math.ceil(ch)}px"></span>`;
  };

  const revealed = revealFor(src).cells;
  let html = "";
  for (let i = 0; i < grid.total; i++) if (!revealed.has(i)) html += cellHTML(i);
  mask.innerHTML = html;

  if (!isGM()) return;

  /* ---- Brocha de revelado (solo GM) ---- */

  const pending = new Set(revealed);
  let brush = null;

  const cellAt = ev => {
    const r = cv.getBoundingClientRect();
    const c = Math.floor((ev.clientX - r.left) / cw);
    const row = Math.floor((ev.clientY - r.top) / ch);
    if (c < 0 || row < 0 || c >= cols || row >= rows) return null;
    return row * cols + c;
  };

  const apply = i => {
    if (i === null) return;
    if (brush === "reveal") {
      if (pending.has(i)) return;
      pending.add(i);
      mask.querySelector(`[data-i="${i}"]`)?.remove();
    } else {
      if (!pending.has(i)) return;
      pending.delete(i);
      mask.insertAdjacentHTML("beforeend", cellHTML(i));
    }
  };

  frameEl.addEventListener("pointerdown", ev => {
    if (ev.button !== 0 || ev.shiftKey) return;   // shift+arrastrar es desplazar
    ev.preventDefault();
    brush = ev.altKey ? "hide" : "reveal";        // alt invierte la brocha
    apply(cellAt(ev));
    frameEl.setPointerCapture(ev.pointerId);
  });

  frameEl.addEventListener("pointermove", ev => { if (brush) apply(cellAt(ev)); });

  const finish = async () => {
    if (!brush) return;
    brush = null;
    // Una sola escritura al soltar, no una por celda pintada.
    await setReveal(src, { cells: pending });
  };
  frameEl.addEventListener("pointerup", finish);
  frameEl.addEventListener("pointercancel", finish);

  frameEl.addEventListener("contextmenu", async ev => {
    ev.preventDefault();
    const r = cv.getBoundingClientRect();
    await setReveal(src, {
      marker: { x: (ev.clientX - r.left) / r.width, y: (ev.clientY - r.top) / r.height }
    });
  });
}

/* -------------------------------------------- */
/*  Camara                                      */
/* -------------------------------------------- */

/** Centra el tablero en un punto del mundo, sin cambiar el zoom. */
async function centerOn(world) {
  const [scale, w, h] = await Promise.all([
    OBR.viewport.getScale(), OBR.viewport.getWidth(), OBR.viewport.getHeight()
  ]);
  await OBR.viewport.animateTo({
    scale,
    position: { x: w / 2 - world.x * scale, y: h / 2 - world.y * scale }
  });
}

/**
 * El encuadre.
 *
 * El SDK no avisa cuando se mueve la camara (no hay onChange en viewport), asi
 * que hay que preguntarlo. Se hace unas ocho veces por segundo, que para un
 * rectangulo de referencia sobra, y se mueve solo el div en vez de redibujar
 * el minimapa entero.
 */
function startCameraLoop() {
  let busy = false;
  setInterval(async () => {
    if (busy || !prefs().showViewport || mode === "image" || !T) return;
    busy = true;
    try {
      const [tl, br] = await Promise.all([
        OBR.viewport.inverseTransformPoint({ x: 0, y: 0 }),
        OBR.viewport.inverseTransformPoint({ x: viewSize.w, y: viewSize.h })
      ]);
      camera = { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
      const el = root.querySelector(".mm-viewport");
      if (el && T) {
        const a = T.toMap(camera.x, camera.y);
        el.style.left = `${a.x.toFixed(1)}px`;
        el.style.top = `${a.y.toFixed(1)}px`;
        el.style.width = `${(camera.w * T.scale).toFixed(1)}px`;
        el.style.height = `${(camera.h * T.scale).toFixed(1)}px`;
      }
    } catch {} finally { busy = false; }
  }, 120);

  // El tamano de la ventana cambia poco: se refresca aparte y sin prisa.
  const measure = async () => {
    try {
      viewSize = { w: await OBR.viewport.getWidth(), h: await OBR.viewport.getHeight() };
    } catch {}
  };
  measure();
  setInterval(measure, 2000);
}

/* -------------------------------------------- */
/*  Arranque                                    */
/* -------------------------------------------- */

const redraw = debounce(render, 60);

OBR.onReady(async () => {
  await connect(redraw);
  onMessage(msg => {
    if (msg.type === "prefs") render();
    if (msg.type === "refresh") render();
  });
  window.addEventListener("resize", redraw);
  render();
  startCameraLoop();
});
