/**
 * El panel flotante.
 *
 * En Foundry el minimapa se metia dentro de una columna de la interfaz. Aqui
 * no se puede: una extension vive en un iframe y solo puede pintar donde
 * Owlbear la deje. Lo mas parecido a "anclado en la interfaz" es un popover
 * abierto en una esquina con `disableClickAway`, que se queda puesto hasta que
 * lo cierres y no roba los clics del tablero.
 */

import OBR from "../vendor/obr-sdk.js";
import { ID } from "./state.js";
import { prefs } from "./prefs.js";
import { clamp } from "./geometry.js";

export const PANEL_ID = ID + "/panel";

const MARGIN = 10;      // separacion respecto al borde de la ventana
const CHROME_W = 12;    // relleno lateral del panel
const CHROME_H = 38;    // cabecera + relleno
const TOP_BAR = 44;     // la barra superior de Owlbear, para no taparla

const CORNERS = {
  bottomLeft:  { h: "LEFT",  v: "BOTTOM" },
  topLeft:     { h: "LEFT",  v: "TOP" },
  bottomRight: { h: "RIGHT", v: "BOTTOM" },
  topRight:    { h: "RIGHT", v: "TOP" }
};

const hasFreePos = p => Number.isFinite(p.posX) && Number.isFinite(p.posY);
const panelSize = p => ({ w: p.width + CHROME_W, h: p.height + CHROME_H });

/**
 * La esquina superior izquierda del panel ahora mismo, en pixeles de ventana.
 * Hace falta para arrastrarlo: el iframe no puede saber donde esta colocado,
 * asi que se recalcula desde las mismas preferencias con que se abrio.
 */
export async function panelTopLeft() {
  const p = prefs();
  const { w, h } = panelSize(p);
  const [vw, vh] = await Promise.all([OBR.viewport.getWidth(), OBR.viewport.getHeight()]);
  if (hasFreePos(p)) {
    return { x: clamp(p.posX, 0, Math.max(0, vw - w)), y: clamp(p.posY, 0, Math.max(0, vh - h)) };
  }
  const c = CORNERS[p.dock] ?? CORNERS.bottomLeft;
  return {
    x: c.h === "LEFT" ? MARGIN : Math.max(0, vw - MARGIN - w),
    y: c.v === "TOP" ? MARGIN + TOP_BAR : Math.max(0, vh - MARGIN - h)
  };
}

export async function openPanel() {
  const p = prefs();
  const { w, h } = panelSize(p);
  const [vw, vh] = await Promise.all([OBR.viewport.getWidth(), OBR.viewport.getHeight()]);

  // Dos formas de colocarlo: pegado a una esquina, o donde lo hayas soltado
  // al arrastrarlo. En el segundo caso se ancla por su esquina superior
  // izquierda y se recorta a la ventana, para que no acabe fuera de la vista.
  let anchorPosition, origin;
  if (hasFreePos(p)) {
    anchorPosition = {
      left: clamp(p.posX, 0, Math.max(0, vw - w)),
      top:  clamp(p.posY, 0, Math.max(0, vh - h))
    };
    origin = { horizontal: "LEFT", vertical: "TOP" };
  } else {
    const corner = CORNERS[p.dock] ?? CORNERS.bottomLeft;
    anchorPosition = {
      left: corner.h === "LEFT" ? MARGIN : Math.max(0, vw - MARGIN),
      top:  corner.v === "TOP" ? MARGIN + TOP_BAR : Math.max(0, vh - MARGIN)
    };
    origin = { horizontal: corner.h, vertical: corner.v };
  }

  await OBR.popover.open({
    id: PANEL_ID,
    // Ruta desde el origen, no URL completa: Owlbear la pega detras del
    // origen de la extension en vez de resolverla. `pathname` da justo eso,
    // y se adapta solo al subdirectorio en el que este alojada.
    url: new URL("../minimap.html", import.meta.url).pathname,
    width: w,
    height: h,
    anchorReference: "POSITION",
    anchorPosition,
    anchorOrigin: origin,
    transformOrigin: origin,
    disableClickAway: true,   // no se cierra al hacer clic en el tablero
    hidePaper: true,          // sin el marco de Owlbear: el panel trae el suyo
    marginThreshold: 0
  });
}

export async function closePanel() {
  try { await OBR.popover.close(PANEL_ID); } catch {}
}

/** Reabre el panel para que coja el tamano o la esquina nuevos. */
export async function refreshPanel() {
  await closePanel();
  await openPanel();
}
