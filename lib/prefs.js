/**
 * Preferencias de cada jugador (tamano, tema, posicion...).
 *
 * En Foundry esto eran ajustes de alcance "client". Aqui no hay equivalente,
 * asi que van en localStorage: son de este navegador y no se comparten con
 * nadie, que es justo lo que queremos.
 *
 * El panel de ajustes y el minimapa son dos iframes distintos, de modo que un
 * cambio en uno tiene que llegar al otro. El evento `storage` no es fiable
 * entre iframes incrustados (pueden tener almacenamiento aislado), asi que el
 * aviso va por el canal de mensajes del propio Owlbear, que siempre funciona.
 */

import OBR from "../vendor/obr-sdk.js";
import { CHANNEL } from "./state.js";

const KEY = "scene-minimap/prefs";

export const DEFAULTS = {
  open: false,
  dock: "bottomLeft",   // bottomLeft | topLeft | bottomRight | topRight
  width: 220,
  height: 170,
  theme: "parchment",   // parchment | dark
  fade: true,
  showViewport: true,
  zoom: 1,
  panX: 0,
  panY: 0
};

let cache = null;

export function prefs() {
  if (cache) return cache;
  try {
    cache = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    cache = { ...DEFAULTS };   // almacenamiento bloqueado: se usa en memoria
  }
  return cache;
}

/** Guarda y avisa al otro iframe. */
export function setPrefs(patch, notify = true) {
  cache = { ...prefs(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch {}
  if (notify) send({ type: "prefs", prefs: cache });
  return cache;
}

export function send(data) {
  // LOCAL: solo a los otros iframes de este jugador, no a la mesa entera.
  OBR.broadcast.sendMessage(CHANNEL, data, { destination: "LOCAL" }).catch(() => {});
}

export function onMessage(handler) {
  return OBR.broadcast.onMessage(CHANNEL, ev => {
    const data = ev?.data;
    if (!data?.type) return;
    if (data.type === "prefs") cache = { ...DEFAULTS, ...data.prefs };
    handler(data);
  });
}
