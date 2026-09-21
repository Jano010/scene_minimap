/**
 * Script de fondo: se carga con la sala y sigue vivo aunque no abras nada.
 *
 * Hace dos cosas:
 *   1. Reabrir el minimapa si lo tenias abierto.
 *   2. Seguir al grupo: revelar la pieza del mapa sobre la que estan los
 *      tokens de los jugadores, y marcarla como posicion actual.
 *
 * Lo segundo es la traduccion a Owlbear de lo que en Foundry hacia el
 * "revelado automatico". Alli cada sala era una escena distinta, asi que el
 * disparador era cambiar de escena; aqui el dungeon entero suele ser una sola
 * escena, de modo que lo que marca el avance es donde esta el grupo.
 */

import OBR from "../vendor/obr-sdk.js";
import { store, connect, isGM, resolveMap, piecesState, setPieces, setSceneMap } from "./state.js";
import { prefs, setPrefs, onMessage, send } from "./prefs.js";
import { openPanel, closePanel, panelTopLeft } from "./panel.js";
import { imageBounds, debounce } from "./geometry.js";

/**
 * Solo un GM escribe, para que no compitan varios clientes por el mismo dato.
 * `party.getPlayers()` no se incluye a uno mismo, asi que cada cliente compara
 * su id con el de los demas GM y el resultado es el mismo en todos.
 */
function isPrimaryGM() {
  if (!isGM()) return false;
  const otherGMs = store.players.filter(p => p.role === "GM").map(p => p.id);
  return otherGMs.every(id => String(store.playerId) < String(id));
}

/** Los tokens que pertenecen a jugadores: el grupo. */
function partyTokens() {
  const playerIds = new Set(store.players.filter(p => p.role === "PLAYER").map(p => p.id));
  return store.items.filter(i =>
    i.layer === "CHARACTER" && i.visible && playerIds.has(i.createdUserId));
}

const followParty = debounce(async () => {
  if (!isPrimaryGM() || !store.ready || !store.config.autoReveal) return;
  if (resolveMap().mode !== "pieces") return;

  const party = partyTokens();
  if (!party.length) return;

  // El centro del grupo decide en que pieza esta.
  const cx = party.reduce((a, t) => a + t.position.x, 0) / party.length;
  const cy = party.reduce((a, t) => a + t.position.y, 0) / party.length;

  const st = piecesState();
  const pieces = store.items
    .filter(i => i.type === "IMAGE" && i.layer === "MAP" && !st.excluded.has(i.id))
    .sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0));   // la de encima manda

  const here = pieces.find(i => {
    const b = imageBounds(i, store.dpi);
    return cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h;
  });
  if (!here) return;

  // Nada que escribir si ya estaba revelada y marcada.
  if (st.current === here.id && st.revealed.has(here.id)) return;

  st.revealed.add(here.id);
  await setPieces({ revealed: st.revealed, current: here.id });
}, 500);

/**
 * Abre la biblioteca de imagenes y usa la elegida como mapa de esta escena.
 *
 * Se aplica en el momento en vez de devolver la URL al panel, porque para
 * cuando el usuario elige, el panel ya no esta abierto.
 */
async function pickImage() {
  if (!store.ready) {
    return OBR.notification.show("Abre una escena antes de elegir su mapa.", "WARNING");
  }
  try {
    const [image] = (await OBR.assets.downloadImages(false, undefined, "MAP")) ?? [];
    if (!image?.image?.url) return;            // se cerro sin elegir nada
    const src = image.image.url;
    send({ type: "picked", src });             // por si el panel sigue abierto
    await setSceneMap({ mode: "image", src });
    OBR.notification.show(`Mapa de esta escena: ${image.name || "imagen elegida"}`, "SUCCESS");
  } catch (err) {
    // Nada de tragarse el error en silencio: si la biblioteca no abre, hay
    // que poder saber por que.
    console.error("[minimap] biblioteca:", err);
    OBR.notification.show(`No se pudo abrir la biblioteca: ${err?.message ?? err}`, "ERROR");
  }
}

OBR.onReady(async () => {
  await connect(followParty);

  // Si lo tenias abierto, vuelve a abrirse al entrar en la sala.
  if (prefs().open) {
    try { await openPanel(); } catch (e) { console.error("[minimap]", e); }
  }

  onMessage(async msg => {
    if (msg.type === "panel") {
      if (msg.open) await openPanel();
      else await closePanel();
    }
    // La biblioteca de imagenes se abre desde aqui, no desde el panel de
    // ajustes: al abrirse la biblioteca, Owlbear cierra el popover del panel,
    // y con el se moria el iframe que esperaba la respuesta. Este script vive
    // mientras la sala este abierta, asi que la promesa siempre llega.
    if (msg.type === "pickImage") await pickImage();

    // Mover el panel tambien va por aqui, porque reabrir el popover destruye
    // el iframe que hiciera la llamada a mitad de ejecutarla.
    if (msg.type === "move") {
      const tl = await panelTopLeft();
      setPrefs({ posX: Math.round(tl.x + msg.dx), posY: Math.round(tl.y + msg.dy) });
      await closePanel();
      await openPanel();
    }
  });
});
