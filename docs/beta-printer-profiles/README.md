# Impresoras BETA · configuración local Electron

## Alcance y ejecución

Solo `programandoweb/ivoolve_print`; `ivoolveFlow` no se modifica. Electron carga
`https://ivoolve-print-frontend.vercel.app`. El engranaje de ese frontend abre una
ventana local controlada. También existe el menú nativo «⚙ Impresoras BETA».
`renderer/pages/settings.js` es legado y no participa en el runtime actual.

Tras actualizar el repositorio en la estación Windows, cerrar Electron y ejecutar:

```sh
git pull --ff-only origin main
npm exec --workspace=desktop -- electron .
```

En una instalación nueva ejecutar antes `npm ci`. Mantener el API local de
impresión funcionando como antes. No hace falta redesplegar Vercel para cambiar
esta ventana local. Recargar la web no actualiza Electron ni su preload.

## Controles dentro de cada perfil

Habilitar BETA es un opt-in de la estación. Dentro de cada tarjeta (Etiquetas,
Membretes, Despachos o cualquier perfil personalizado) se encuentran:

- **Perfil activo**: desmarcar pausa ese perfil sin borrar su nombre ni impresora.
  Los trabajos dirigidos a un perfil pausado se rechazan, tanto en modo con
  diálogo como sin diálogo, sin redirigirlos a otra impresora. No desactiva
  físicamente la impresora ni cambia Windows.
- **Impresión silenciosa**: marcado imprime directamente a la cola vinculada;
  desmarcado conserva el diálogo Windows. Cada perfil guarda su propio valor y
  autorización de cola. Se necesita perfil activo y una impresora guardada.
- **Recibir trabajos de etiquetas**: selección exclusiva del perfil que atiende
  el flujo de impresión actual. Cambiar esa selección no cambia los checks de
  los otros perfiles. El contrato actual `print-labels` solo genera etiquetas:
  no se inventan tipos de trabajo ni se cambian payloads/sockets para simular
  membretes o despachos. Esos perfiles ya guardan sus preferencias independientes.

Los checks y la selección de destino se guardan inmediatamente. El botón Guardar
persiste el nombre y la asociación de impresora. Renombrar conserva preferencias;
revincular o desvincular desarma la impresión silenciosa de ese perfil para que
el operador confirme de nuevo el nuevo destino. Nuevos perfiles empiezan activos,
con modo silencioso OFF. Desactivar un perfil también desarma su modo silencioso;
reactivarlo no lo rearma. Desactivar BETA desarma el modo silencioso de todos,
conservando perfiles y asociaciones. BETA OFF vuelve al flujo tradicional.

Eliminar el perfil que recibe etiquetas bloquea los siguientes trabajos hasta
seleccionar otro destino; no hay reasignación silenciosa a la predeterminada.
El cuadro global de modo de impresión se eliminó: los controles están en cada
perfil, con texto visible de modo con diálogo, sin diálogo o pausado.

## Persistencia y migración

`core.js` almacena `beta-printer-profiles.json` bajo `app.getPath('userData')`:

- Esquema v1 con extensión compatible; UUID de estación sin hostname.
- `labelsProfileId` guarda el destino de etiquetas por ID estable.
- Cada perfil conserva `id`, `label`, `identity`, `enabled`, `silentEnabled` y
  `silentQueueConfirmation` independiente.
- Al leer configuraciones anteriores, se conservan todos los perfiles y sus
  huellas. La selección global anterior se convierte en destino de etiquetas;
  su modo silencioso y confirmación se trasladan únicamente a ese perfil.
  Los demás comienzan activos y con modo silencioso OFF. Si nunca hubo destino
  global, el perfil llamado Etiquetas se toma como destino inicial.
- Escritura temporal exclusiva, fsync y rename; tamaño y esquema validados.
  Configuraciones corruptas/incompatibles desactivan BETA sin bloquear Electron
  ni la impresión tradicional. No se sobreescriben hasta un guardado explícito.
- Un fallo de escritura no publica un cambio parcial en memoria.

## Inventario y dos impresoras idénticas

`inventory.js` usa `webContents.getPrintersAsync()` y, en Windows, una consulta
CIM fija Win32_Printer: nombre, driver, puerto, PnP y estado cuando están disponibles.
PowerShell sin shell, entradas de usuario, elevación ni escrituras al sistema;
timeout de 8 segundos y buffer limitado. El fallo de CIM permite mostrar el
inventario Electron con diagnóstico, sin inventar driver, puerto o serial.
No se interpreta una cola disponible como conexión física online.

La resolución automática distingue probable, ambigua, no encontrada y verificada
(esta última preparada para una fuente de serial físico fiable, que CIM actual
no proporciona). Nombre de cola, USB003 y PnP son pistas mutables, no pruebas de
identidad física. No se generan seriales a partir de Instance IDs.

Para dos colas del mismo modelo se permite impresión sin diálogo tras una
confirmación nativa explícita del perfil, nombre de cola, driver y puerto:

1. Exige una única coincidencia exacta de la huella completa guardada, nombre de
   cola único en el inventario y driver/puerto disponibles.
2. Informa que se confirma una cola Windows, no la identidad física por serial.
3. Cancelar no activa el modo ni altera otros perfiles. Aceptar vuelve a consultar
   el inventario antes de guardar la autorización en ese perfil.
4. Cambios de nombre, driver, puerto o PnP, colisiones, desconexión y estado offline
   bloquean el envío. La autorización no se reutiliza para otro perfil/destino.

Si se intercambian físicamente equipos sin cambios visibles para Windows, no es
posible detectar el intercambio: el operador debe verificar nuevamente cada
cola. La UI muestra «Cola confirmada», nunca «Identidad física verificada».

La prueba de identificación es separada: vista previa, confirmación humana y
confirmación nativa; una página, una copia, siempre `silent: false`. El diálogo
del driver puede cambiar opciones y el operador debe verificar destino/copia.
Para las colas físicamente ambiguas, la prueba BETA sigue bloqueada: usar primero
la página de prueba de Windows para verificar el equipo antes de autorizarlo.

## IPC y flujo de impresión

`index.js` registra IPC nominado para la ventana local: estado, activación BETA,
inventario, CRUD, ajustes de perfil, selección del destino de etiquetas y prueba.
Valida tipos/límites y exige webContents, frame principal y URL local exactos.
Preload aislado, sandbox, contextIsolation, nodeIntegration OFF; CSP sin red,
URLs externas, popups, navegación ni webviews en la ventana de configuración.

El frontend remoto solo recibe `ivoolvePrinterSettings.open()` en el origen HTTPS
exacto de Vercel. El proceso principal verifica origen y shell registrado; ese
launcher solo abre/enfoca la ventana local y no accede al almacén ni al inventario.
No expone IPC genérico, comandos, rutas, tokens ni secretos.

`silent.js` resuelve el perfil dirigido al trabajo. BETA OFF o perfil activo con
silencioso OFF conserva opciones tradicionales sin enumerar por trabajo. Perfil
seleccionado desactivado/inexistente devuelve error antes de crear una ventana
de impresión. En modo silencioso valida origen remoto, consulta inventario y
aplica únicamente `silent: true` y `deviceName` de ese perfil.

El handler `print-labels` mantiene API HTML, payload, márgenes, layout, callback
y ACK. No se modifica API, sockets ni frontend de órdenes. Los trabajos existentes
manuales y recibidos por sockets atraviesan la misma selección local; no se crean
agentes ni trabajos adicionales. Ante error no hay retry ni fallback silencioso
que pueda duplicar/redirigir una impresión. Configuración modificada durante
la enumeración aborta el envío. Trabajos ya aceptados por Windows no se cancelan
por desactivar después un check.

## UI Tailwind local y validaciones

Interfaz con tarjetas, iconos SVG, estados, contadores, secciones adaptables y
pantalla OFF. `tailwind.css` es la fuente; `style.css` es el CSS compilado incluido
en git para ejecutar sin CDN, fuentes remotas ni pasos de build en Windows.
Se usan las dependencias PostCSS/Tailwind existentes. Los datos se insertan como
texto, sin HTML de impresoras o usuarios.

```sh
node apps/desktop/beta-printers/build-styles.cjs
find apps/desktop/beta-printers -name '*.js' -exec node --check {} \;
node --test apps/desktop/beta-printers/test/*.test.js
git diff --check
```

17 pruebas automatizadas: inventario/fallback CIM, esquema/corrupción/escritura,
regresión del handler/preload, origen/frame IPC, cancelación/confirmación manual,
colisiones/offline, persistencia/migración, modos por perfil independientes,
pausa efectiva de trabajos con/sin diálogo, selección por ID, renombrado y
reactivación sin activación silenciosa inesperada.

La UI se revisó en Chromium con datos e IPC simulados a 1100×800, 390×844 y
1400×900: checks independientes, controles deshabilitados, CRUD, refresco,
BETA OFF y ausencia de errores JS/desbordamiento horizontal. No se modificó
Next/TypeScript y su build no valida esta ventana local. Las pruebas gráficas
no acreditan Electron nativo, drivers ni hardware Windows.

Pendiente validar físicamente: reinicio y migración en la estación, dos USB
iguales, confirmación de cola/puerto, impresión sin diálogo real, perfil pausado,
cambio de puerto, cancelación del driver y flujo habitual con diálogo.
