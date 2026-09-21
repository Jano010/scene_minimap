/**
 * Geometria.
 *
 * Owlbear coloca las imagenes con dos datos propios de cada imagen:
 *   grid.dpi    -> cuantos pixeles de la imagen mide una celda de rejilla
 *   grid.offset -> que punto de la imagen (en pixeles) cae sobre `position`
 *
 * Con el dpi de la escena (unidades de mundo por celda) sale el factor de
 * conversion de pixeles de imagen a unidades de mundo, y con el, el rectangulo
 * que ocupa cada imagen. Es la misma cuenta que hace Owlbear para dibujarla.
 */

/** Rectangulo en unidades de mundo que ocupa un item de imagen. */
export function imageBounds(item, sceneDpi) {
  const k = sceneDpi / (item.grid?.dpi || sceneDpi);
  const w = item.image.width * k * item.scale.x;
  const h = item.image.height * k * item.scale.y;
  return {
    x: item.position.x - (item.grid?.offset?.x ?? 0) * k * item.scale.x,
    y: item.position.y - (item.grid?.offset?.y ?? 0) * k * item.scale.y,
    w, h
  };
}

/** Caja que engloba a todas. Null si no hay ninguna. */
export function unionBounds(boxes) {
  if (!boxes.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
}

/**
 * La transformacion del marco: el mapa se dibuja a la escala que haga falta
 * para caber, multiplicada por el zoom. Asi el marco nunca cambia de tamano
 * sea cual sea la forma del mapa.
 */
export function makeTransform(box, frameW, frameH, zoom = 1) {
  const scale = Math.min(frameW / box.w, frameH / box.h) * zoom;
  return {
    scale,
    w: Math.max(1, Math.round(box.w * scale)),
    h: Math.max(1, Math.round(box.h * scale)),
    toMap: (x, y) => ({ x: (x - box.x) * scale, y: (y - box.y) * scale }),
    toWorld: (x, y) => ({ x: box.x + x / scale, y: box.y + y / scale })
  };
}

/** Donde va el lienzo dentro del marco: centrado, mas el desplazamiento. */
export function canvasOffset(frameW, frameH, cw, ch, pan) {
  return {
    x: Math.round((frameW - cw) / 2 + (pan?.x ?? 0)),
    y: Math.round((frameH - ch) / 2 + (pan?.y ?? 0))
  };
}

export function esc(text) {
  return String(text ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
