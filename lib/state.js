/**
 * Estado compartido.
 *
 * Owlbear no tiene "ajustes de modulo", tiene metadatos. Y hay dos alcances,
 * que son justo los dos que necesitamos:
 *
 *   - metadatos de ESCENA  -> viven en esa escena y solo en esa
 *   - metadatos de SALA    -> viven en la sala entera, por encima de las escenas
 *
 * De ahi sale, casi solo, lo que queriamos: el mapa asignado va en la escena,
 * y el revelado de una imagen va en la sala indexado por la URL de la imagen.
 * Dos escenas que apunten a la misma imagen comparten revelado sin hacer nada,
 * porque para el revelado son la misma cosa. Una escena de exterior con otra
 * imagen lleva su propio revelado aparte.
 *
 * El revelado por PIEZAS, en cambio, va en la escena: los ids de los items son
 * de la escena en la que estan, asi que compartirlos entre escenas no querria
 * decir nada.
 */

import OBR from "../vendor/obr-sdk.js";

export const ID = "com.jano.scene-minimap";
export const CHANNEL = ID + "/sync";

const K = {
  MAP:    ID + "/map",      // escena: { mode, src } o ausente = hereda
  PIECES: ID + "/pieces",   // escena: { revealed, excluded, current }
  CONFIG: ID + "/config",   // sala:   valores por defecto y permisos
  REVEAL: ID + "/reveal"    // sala:   { [url]: { cells, marker } }
};

export const DEFAULT_CONFIG = {
  mode: "live",             // "live" | "pieces" | "image"
  src: "",
  cols: 24,                 // resolucion de la rejilla de revelado
  playersEnabled: true,     // los jugadores pueden ver el minimapa
  playersBackground: false, // los jugadores ven la imagen del mapa
  autoReveal: true          // revelar la pieza al entrar en su escena
};

const EMPTY_PIECES = { revealed: [], excluded: [], current: null };

export const store = {
  role: "PLAYER",
  playerId: null,
  playerColor: "#4ec9f5",
  selection: [],
  ready: false,             // hay una escena abierta
  dpi: 150,                 // unidades de mundo por celda de rejilla
  config: { ...DEFAULT_CONFIG },
  sceneMap: null,           // asignacion propia de la escena, o null
  pieces: { ...EMPTY_PIECES },
  reveal: {},               // { [url]: { cells, marker } }
  items: [],
  players: []               // para el color de los puntos
};

export const isGM = () => store.role === "GM";

/** Lo que ve un jugador: el GM manda. */
export const canSee = () => isGM() || store.config.playersEnabled;
export const canSeeBackground = () => isGM() || store.config.playersBackground;

/**
 * El mapa de la escena actual: el suyo propio si lo tiene, si no el de la sala.
 * `own` dice cual de los dos, para poder marcarlo en la interfaz.
 */
export function resolveMap() {
  const m = store.sceneMap;
  if (m?.mode) return { mode: m.mode, src: m.src || "", own: true };
  return { mode: store.config.mode, src: store.config.src || "", own: false };
}

/** Revelado guardado para una imagen. Compartido por todas las escenas que la usen. */
export function revealFor(src) {
  const r = store.reveal?.[src];
  return { cells: new Set(r?.cells ?? []), marker: r?.marker ?? null };
}

export function piecesState() {
  return {
    revealed: new Set(store.pieces?.revealed ?? []),
    excluded: new Set(store.pieces?.excluded ?? []),
    current: store.pieces?.current ?? null
  };
}

/* -------------------------------------------- */
/*  Escritura (solo el GM deberia llegar aqui)  */
/* -------------------------------------------- */

export async function setConfig(patch) {
  const config = { ...store.config, ...patch };
  store.config = config;
  await OBR.room.setMetadata({ [K.CONFIG]: config });
}

/** value = { mode, src } para asignar, o null para volver a heredar. */
export async function setSceneMap(value) {
  store.sceneMap = value;
  await OBR.scene.setMetadata({ [K.MAP]: value ?? undefined });
}

export async function setReveal(src, patch) {
  if (!src) return;
  const all = { ...store.reveal };
  const cur = all[src] ?? { cells: [], marker: null };
  all[src] = {
    cells: patch.cells ? Array.from(patch.cells).sort((a, b) => a - b) : cur.cells,
    marker: "marker" in patch ? patch.marker : cur.marker
  };
  store.reveal = all;
  await OBR.room.setMetadata({ [K.REVEAL]: all });
}

export async function setPieces(patch) {
  const cur = store.pieces ?? EMPTY_PIECES;
  const next = {
    revealed: patch.revealed ? Array.from(patch.revealed) : cur.revealed,
    excluded: patch.excluded ? Array.from(patch.excluded) : cur.excluded,
    current: "current" in patch ? patch.current : cur.current
  };
  store.pieces = next;
  await OBR.scene.setMetadata({ [K.PIECES]: next });
}

/* -------------------------------------------- */
/*  Conexion                                    */
/* -------------------------------------------- */

function readRoom(md) {
  store.config = { ...DEFAULT_CONFIG, ...(md?.[K.CONFIG] ?? {}) };
  store.reveal = md?.[K.REVEAL] ?? {};
}

function readScene(md) {
  const m = md?.[K.MAP];
  store.sceneMap = m?.mode ? m : null;
  store.pieces = { ...EMPTY_PIECES, ...(md?.[K.PIECES] ?? {}) };
}

/**
 * Se suscribe a todo lo que puede cambiar y llama a `onChange` cuando algo
 * cambia. Devuelve una funcion para desconectarse.
 *
 * La idea es que el resto del codigo pinte leyendo `store` de forma sincrona,
 * sin awaits por medio: aqui se mantiene al dia y alli solo se dibuja.
 */
export async function connect(onChange) {
  const unsubs = [];
  const emit = () => { try { onChange(); } catch (e) { console.error("[minimap]", e); } };

  store.role = await OBR.player.getRole();
  store.playerId = OBR.player.id;
  store.selection = (await OBR.player.getSelection()) ?? [];
  store.playerColor = await OBR.player.getColor();
  unsubs.push(OBR.player.onChange(p => {
    store.role = p.role;
    store.selection = p.selection ?? [];
    store.playerColor = p.color ?? store.playerColor;
    emit();
  }));

  store.players = await OBR.party.getPlayers();
  unsubs.push(OBR.party.onChange(players => { store.players = players; emit(); }));

  readRoom(await OBR.room.getMetadata());
  unsubs.push(OBR.room.onMetadataChange(md => { readRoom(md); emit(); }));

  // Los metadatos y los items de una escena solo existen si hay escena abierta.
  const loadScene = async ready => {
    store.ready = ready;
    if (ready) {
      store.dpi = await OBR.scene.grid.getDpi();
      readScene(await OBR.scene.getMetadata());
      store.items = await OBR.scene.items.getItems();
    } else {
      store.sceneMap = null;
      store.pieces = { ...EMPTY_PIECES };
      store.items = [];
    }
    emit();
  };
  await loadScene(await OBR.scene.isReady());
  unsubs.push(OBR.scene.onReadyChange(loadScene));
  unsubs.push(OBR.scene.onMetadataChange(md => { if (store.ready) { readScene(md); emit(); } }));
  unsubs.push(OBR.scene.items.onChange(items => { store.items = items; emit(); }));

  return () => unsubs.forEach(u => { try { u(); } catch {} });
}
