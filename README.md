# Scene Minimap — para Owlbear Rodeo

Un minimapa flotante para Owlbear Rodeo: el mapa, los tokens y el rectángulo de lo que estás
viendo, en una esquina de la pantalla. Con revelado por zonas para dungeon crawls, y **el mapa
asignado por escena**, de modo que al cambiar de escena el minimapa cambia solo.

Es el hermano del módulo `scene-minimap` de Foundry. Mismo diseño, misma cara; las tripas cambian
bastante porque la plataforma no se parece en nada (ver *Diferencias con la versión de Foundry*).

## Instalación

Aquí está la diferencia gorda con Foundry: **una extensión de Owlbear no se copia en una carpeta,
se publica en una URL**. Owlbear la carga dentro de un iframe desde donde tú la alojes, así que lo
primero es ponerla en algún sitio con HTTPS.

No hace falta compilar nada: son ficheros estáticos y el SDK va incluido en `vendor/`. Súbelos tal
cual.

### Las rutas del manifiesto, que es donde todo el mundo se estrella

**Owlbear no resuelve las rutas del `manifest.json` como URLs relativas: las pega detrás del
origen.** Es decir, toma `https://tu-dominio.com` y le concatena lo que pongas. Así que una ruta
como `"action.html"` se convierte en `https://tu-dominio.comaction.html`, que no existe, y la
extensión se queda en blanco y sin icono en la barra.

Las rutas tienen que empezar por `/` **y llevar el subdirectorio donde esté alojada la extensión**:

```json
"icon": "/scene_minimap/icon.svg",
"action": { "popover": "/scene_minimap/action.html", ... },
"background_url": "/scene_minimap/background.html"
```

Si cambias el nombre del repositorio, o la mueves a la raíz de un dominio, **hay que ajustar esas
cuatro rutas**. Es el único sitio del proyecto donde la ubicación está escrita a mano: el resto del
código la deduce sola.

### Opción A — GitHub Pages (lo más rápido y gratis)

1. Crea un repositorio y sube el contenido de esta carpeta a la raíz.
2. *Settings → Pages → Deploy from a branch*, rama `main`, carpeta `/`.
3. Tu manifiesto queda en `https://<usuario>.github.io/<repo>/manifest.json`.
4. Pon el nombre del repositorio en las cuatro rutas del manifiesto, como arriba.

### Opción B — tu propio servidor

Ya tienes el servidor de Oracle. Cualquier servidor estático vale; con nginx basta un bloque así,
dentro del `server` que ya tiene el certificado:

```nginx
location /obr-minimap/ {
    alias /var/www/obr-scene-minimap/;
    add_header Access-Control-Allow-Origin "*";
}
```

La cabecera `Access-Control-Allow-Origin` importa: Owlbear pide el manifiesto desde su propio
dominio y sin ella el navegador lo bloquea. Y las rutas del manifiesto tendrían que ser
`/obr-minimap/...`, siguiendo la regla de arriba.

### Y después, en Owlbear

*Settings → Extensions → Add Custom Extension*, y pega la URL del `manifest.json`. Aparece el botón
del minimapa en la barra de la izquierda.

> **Si el panel sale en blanco y no aparece el icono en la barra**, casi seguro son las rutas del
> manifiesto: mira la sección de arriba. El navegador da la pista exacta — un error de DNS con el
> dominio y el fichero pegados sin barra (`tu-dominio.comaction.html`).

### Probar el aspecto sin Owlbear

`dev/preview.html` pinta el panel con el CSS de verdad y datos de mentira, para trastear con el
estilo sin montar una sala. Ábrelo con cualquier servidor estático:

```bash
python3 -m http.server 8777
```

## Uso

El botón de la barra abre el **panel de ajustes**; desde ahí se muestra u oculta el **minimapa**,
que es una ventanita aparte anclada en la esquina que elijas. El minimapa se queda puesto: no se
cierra al hacer clic en el tablero, y vuelve a salir solo la próxima vez que entres en la sala.

| Gesto sobre el minimapa | Efecto |
| --- | --- |
| Clic | Mueve la cámara a ese punto |
| Rueda del ratón | Zoom (de 1× a 8×) |
| **Shift** + arrastrar, o botón central | Desplazar el mapa dentro del marco |
| Botón de reencuadre | Volver a la vista completa |

Los puntos son los tokens, con **el color del jugador que los puso**. El que tengas seleccionado
lleva un halo blanco; los ocultos salen atenuados y con el borde discontinuo, y **solo los ve el
master**.

## Los tres modos

| Modo | Qué dibuja |
| --- | --- |
| **El mapa de la escena** | Todo lo que hay en la capa *Map*, tal cual, con tokens y encuadre. Es el minimapa de toda la vida. |
| **Revelado por piezas** | Lo mismo, pero cada imagen de la capa *Map* se revela por separado. Para dungeons montados con piezas. |
| **Una imagen fija** | Una imagen cualquiera (el plano dibujado del dungeon) revelada con una rejilla. No lleva tokens: esa imagen no tiene relación de coordenadas con el tablero. |

### Revelado por piezas

Pensado para el dungeon montado con losetas, que en Owlbear es lo normal: cada habitación es una
imagen en la capa *Map*.

| Acción del master | Resultado |
| --- | --- |
| Clic en una pieza | La revela u oculta |
| **Alt** + clic en una pieza | La saca del plano (fondos, decoración suelta) |
| Botones de la cabecera | Revelar todo · ocultar todo · recuperar las excluidas |

El master ve el plano entero con lo no revelado en gris y con borde discontinuo, para poder
trabajar sobre el conjunto; los jugadores ven **solo** lo revelado, sobre negro.

**Las piezas que no son del dungeon hay que excluirlas** (Alt+clic). El encuadre se calcula con la
caja que engloba a las piezas incluidas, así que una sola imagen ajena y lejana dispara la caja y
encoge todo el dungeon a una esquina. El botón ámbar de la cabecera las devuelve.

#### El dungeon se revela solo según avanza el grupo

Con *Revelar la pieza donde está el grupo* activado, no hay que ir haciendo clic: **la pieza sobre
la que están los tokens de los jugadores se revela sola** y queda marcada con un halo como posición
actual del grupo. Mueves los tokens como ya haces y el dungeon se va abriendo.

Cuenta como "el grupo" los tokens que pertenecen a jugadores con rol *Player*. Si en tu mesa los
pone todos el master, no hay a quién seguir y el revelado automático no hace nada: revela a mano.

### Una imagen fija

| Acción del master | Resultado |
| --- | --- |
| Arrastrar sobre el mapa | Revela esas zonas |
| **Alt** + arrastrar | Vuelve a ocultarlas |
| Clic derecho | Coloca el marcador de "aquí está el grupo" |
| Botones de la cabecera | Revelar todo · ocultar todo · quitar el marcador |

El master ve lo no revelado translúcido, para trabajar sobre el mapa completo; los jugadores lo ven
opaco. El marcador lo ven todos.

La imagen se elige con **la biblioteca de imágenes de Owlbear** (botón *Elegir*), o pegando una URL.

## Cada escena con su mapa

El mapa se resuelve **por escena**. Estás en la cripta y ves el plano de la cripta; abres la escena
del bosque y el minimapa cambia solo al mapa de la región.

Se asigna en el panel de ajustes, en *Mapa de esta escena*. Una escena puede:

- **heredar lo que diga la sala** (es como empiezan todas), o
- llevar su propio modo e imagen.

### Compartir mapa entre escenas

La otra mitad: **si dos escenas apuntan a la misma imagen, comparten también lo revelado.** Las seis
salas de un dungeon van juntas — reveles donde reveles, todas ven lo mismo — mientras que el
exterior lleva su mapa y su revelado, sin pisarse.

Sale gratis por dónde se guarda cada cosa. Owlbear tiene dos alcances para los metadatos y son
justo los dos que hacían falta:

| Qué | Dónde vive | Consecuencia |
| --- | --- | --- |
| El mapa asignado | metadatos de la **escena** | Cada escena decide el suyo |
| El revelado de una imagen | metadatos de la **sala**, indexado por la URL de la imagen | Dos escenas con la misma imagen son, para el revelado, la misma cosa |
| El revelado por piezas | metadatos de la **escena** | Los ids de los items son de su escena, así que compartirlos no querría decir nada |

En el desplegable *Compartir un mapa ya en uso* salen los mapas que ya tienen revelado en esta
sala. Elegir uno de ahí es exactamente decir "esta sala también es de este dungeon".

## Qué ve cada quien

Dos ajustes de sala, solo del master:

| Ajuste | Por defecto | Efecto |
| --- | --- | --- |
| Los jugadores pueden ver el minimapa | Activado | Si lo apagas, el minimapa queda solo para el master. |
| Los jugadores ven la imagen del mapa | **Desactivado** | Apagado: los jugadores ven solo los puntos sobre un fondo liso cuadriculado. Encendido: ven las imágenes del mapa. |

**El minimapa no reproduce la niebla de guerra.** Si enciendes lo segundo, los jugadores verán el
mapa entero, incluido lo que no han explorado. Por eso viene apagado: con el fondo liso se orientan
por la posición del grupo sin que se les regale la geografía. Si lo que quieres es que vean el
dungeon según lo descubren, eso es el modo *revelado por piezas*, que sí está pensado para ello.

Lo que sí se respeta siempre: **un token oculto no se le manda a un jugador**, igual que en el
tablero.

## Cómo está montado

Tres páginas, que es la estructura que pide Owlbear:

| Fichero | Qué es |
| --- | --- |
| `action.html` | El panel del botón de la barra: ajustes y asignación de mapa. |
| `minimap.html` | El minimapa flotante. Es un *popover* con `disableClickAway`, anclado a una esquina. |
| `background.html` | Script de fondo: vive mientras la sala esté abierta. Reabre el minimapa y sigue al grupo. |

Y las piezas compartidas en `lib/`: `state.js` (metadatos y suscripciones), `geometry.js` (las
cuentas), `prefs.js` (preferencias locales), `panel.js` (abrir y cerrar el panel).

Detalles que importan:

- **Dónde se dibuja.** En Foundry el minimapa se metía dentro de una columna de la interfaz. Aquí
  no se puede: una extensión vive en un iframe. Lo más parecido a "anclado" es un popover con
  `disableClickAway: true` y `hidePaper: true`, que se queda puesto y no roba los clics del tablero.
- **El encuadre se consulta, no se escucha.** `OBR.viewport` no avisa cuando se mueve la cámara, así
  que hay un bucle que lo pregunta unas ocho veces por segundo y mueve solo ese rectángulo, sin
  redibujar el minimapa entero.
- **Dónde va cada imagen.** Owlbear coloca las imágenes con el `grid.dpi` y el `grid.offset` de cada
  una; con el dpi de la escena sale el rectángulo que ocupa en el mundo. Es la misma cuenta que hace
  Owlbear para dibujarla, y está en `imageBounds()`.
- **El zoom redibuja** en vez de escalar con CSS: así los puntos de los tokens y el rectángulo del
  encuadre mantienen su grosor en pantalla en lugar de inflarse.
- **Pintar arrastrando genera una sola escritura**, al soltar el ratón, no una por celda.
- **Solo un master escribe** el revelado automático. Como `party.getPlayers()` no te incluye a ti
  mismo, cada cliente compara su id con el de los demás masters y todos llegan a la misma
  conclusión sobre quién manda.
- **El SDK va incluido** en `vendor/` (v3.1.0, con sus tres dependencias), con las rutas reescritas
  a local. No se depende de ningún CDN en tiempo de ejecución.

## Diferencias con la versión de Foundry

| | Foundry | Owlbear |
| --- | --- | --- |
| Dónde vive | Metido en la interfaz | Ventanita flotante en una esquina |
| Ajustes | `game.settings` | Metadatos de sala, escena y `localStorage` |
| Color de los puntos | Disposición del token (amistoso, hostil...) | Color del jugador que lo puso — Owlbear no tiene disposiciones |
| Revelado automático | Al activar la escena vinculada a la pieza | Al entrar los tokens del grupo en la pieza |
| Plano del dungeon | Una escena aparte que hacía de plano maestro | Las propias imágenes de la capa *Map* de la escena |
| Atajo de teclado | Shift+M | No hay: Owlbear no deja registrar atajos |

## Limitaciones conocidas

- No reproduce la niebla de guerra ni la iluminación dinámica.
- En el modo de imagen fija no se dibujan tokens: esa imagen no tiene relación de coordenadas con
  el tablero. La referencia es el marcador que pone el master.
- El rectángulo del encuadre va a unas ocho actualizaciones por segundo, no a 60: al mover mucho la
  cámara se le nota un pelín de retraso. Es a propósito, para no freír la conexión con Owlbear.
- Las preferencias de aspecto se guardan en el navegador, así que son de ese navegador: si entras
  desde otro ordenador, empiezan por defecto.

## Historial

- **1.0.0** — Primera versión: los tres modos, mapa por escena, revelado compartido por imagen,
  revelado automático siguiendo al grupo, temas pergamino y oscuro.
