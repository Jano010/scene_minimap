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

export const PANEL_ID = ID + "/panel";

const MARGIN = 10;      // separacion respecto al borde de la ventana
const CHROME_W = 12;    // relleno lateral del panel
const CHROME_H = 38;    // cabecera + relleno

const CORNERS = {
  bottomLeft:  { h: "LEFT",  v: "BOTTOM" },
  topLeft:     { h: "LEFT",  v: "TOP" },
  bottomRight: { h: "RIGHT", v: "BOTTOM" },
  topRight:    { h: "RIGHT", v: "TOP" }
};

export async function openPanel() {
  const p = prefs();
  const corner = CORNERS[p.dock] ?? CORNERS.bottomLeft;
  const [vw, vh] = await Promise.all([OBR.viewport.getWidth(), OBR.viewport.getHeight()]);

  // El punto de anclaje es la esquina elegida de la ventana, y se le pega la
  // misma esquina del panel (transformOrigin), de modo que el panel queda
  // dentro y no colgando fuera.
  const anchorPosition = {
    left: corner.h === "LEFT" ? MARGIN : Math.max(0, vw - MARGIN),
    top:  corner.v === "TOP" ? MARGIN + 44 : Math.max(0, vh - MARGIN)
  };

  await OBR.popover.open({
    id: PANEL_ID,
    url: new URL("../minimap.html", import.meta.url).href,
    width: p.width + CHROME_W,
    height: p.height + CHROME_H,
    anchorReference: "POSITION",
    anchorPosition,
    anchorOrigin: { horizontal: corner.h, vertical: corner.v },
    transformOrigin: { horizontal: corner.h, vertical: corner.v },
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
