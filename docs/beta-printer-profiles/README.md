# Perfiles locales de impresoras BETA

## Alcance y baseline

Repositorio: `programandoweb/ivoolve_print`. Baseline limpio de `main`:
`e1a758cebdf2a77e1653010e2d747fd8043776a8`.

Electron ejecuta `apps/desktop/main.js`, que carga
`https://ivoolve-print-frontend.vercel.app`; no carga `renderer/pages/settings.js`.
La configuración legada de `localStorage` no se lee ni modifica. El frontend Next
local no es necesario para esta pantalla. No se requiere desplegar Vercel.

El montaje inicial modifica `apps/desktop/main.js`: importación y
registro del módulo, más montaje del menú nativo visible «⚙ Impresoras BETA».
El cambio de visibilidad de este menú es deliberado para garantizar acceso real
sin inyectar código en el sitio remoto. No cambia la URL ni su navegación.
El puente `window.api.print`, Socket.IO, API y plantillas quedan idénticos.
La fase opcional sin diálogo añade al handler `print-labels` una consulta local
de opciones y su aplicación a la llamada Electron; el resto del handler permanece
igual. Con el check desmarcado, las opciones efectivas son las originales. No se modificó `ivoolveFlow`.

## Ejecución y activación

En una estación Windows con Node y dependencias instaladas:

```sh
npm ci
npm exec --workspace=desktop -- electron .
```

El comando del workspace inicia Electron directamente; el shell sigue remoto.
Para trabajar con el flujo local habitual también se conserva `npm run dev:desktop`.
El API local que usa la impresión tradicional debe seguir operando como antes.

1. Abrir el engranaje «Impresoras BETA» en la esquina superior derecha del frontend
   de Vercel dentro de Electron. También sigue disponible el menú nativo
   «⚙ Impresoras BETA → Configurar perfiles locales…».
2. BETA comienza apagada en una instalación nueva. Habilitarla explícitamente.
3. La lista se consulta al abrir la pantalla habilitada o actualizar manualmente.
4. Asignar colas a Etiquetas, Membretes o Despachos; crear, renombrar, desvincular
   y eliminar perfiles sin alterar otras configuraciones.
5. Guardar explícitamente una nueva asociación tras revisar cambios de cola/puerto.
6. Para imprimir sin diálogo, elegir el perfil en «Perfil para las etiquetas» y
   marcar «Imprimir sin cuadro de diálogo». Desmarcarlo restaura el selector Windows.
7. Desactivar BETA conserva los perfiles y desmarca también la impresión sin diálogo.

Desactivada, no enumera impresoras ni ejecuta PowerShell. La configuración se
lee al abrir la ventana o al recibir el primer trabajo para determinar su modo. No existen timers ni suscripciones de hardware. Con el check OFF, los trabajos
normales no consultan el inventario de impresoras. La persistencia de la activación
es local; no hay variable de entorno que la active inadvertidamente.

## Arquitectura y límites

- `core.js`: esquema v1, estación UUID aleatoria sin hostname, perfiles y huellas;
  JSON separado `beta-printer-profiles.json` bajo `app.getPath('userData')`.
  Escritura a temporal exclusivo, fsync y rename; validación de tamaño/esquema.
  Datos corruptos/incompatibles desactivan BETA y se conservan hasta un guardado
  explícito. Errores de escritura no publican un estado parcialmente actualizado.
  Futuras versiones necesitan migración explícita; no se interpretan como v1.
- `inventory.js`: `getPrintersAsync()` más un script fijo Win32_Printer CIM.
  PowerShell sin shell, entradas del usuario ni elevación; timeout de 8 segundos
  y buffer limitado. Fallo de CIM conserva inventario Electron y diagnóstico.
- `index.js`: IPC nominado; solo acepta el webContents, frame principal y URL
  exacta del documento local. Impide navegación, popups y webviews de la ventana.
  El frontend remoto solo puede abrir esta ventana mediante un launcher separado.
  Inventario, perfiles y pruebas mantienen IPC exclusivo del documento local.
  Todo efecto de configuración BETA requiere activación. El modo sin diálogo
  valida además el remitente registrado y el origen Vercel antes de elegir destino.
- `preload.js`: puente exclusivo de la ventana local, sin ipcRenderer genérico.
- `index.html`, `style.css`, `ui.js`: UI local con CSP sin red ni código inline,
  contenido de impresoras insertado mediante textContent; perfiles en ancho completo.

Win32_Printer puede proporcionar nombre, driver, puerto y PNPDeviceID; puede
omitirlos. No se presenta un serial USB derivado de un Instance ID como serial
físico. Esta versión no atribuye seriales físicos: se requiere una futura fuente
fiable que pruebe la correspondencia física. No se exportan metadatos arbitrarios
ni identificadores de usuario. Estado offline solo cuando CIM lo indica;
no se interpreta una cola disponible como prueba de conexión física online.

Estados:

| Estado | Criterio |
| --- | --- |
| Verificada | Serial físico fiable y driver, únicos; preparado en el resolver, no producido por CIM actual |
| Probable | Única candidata del driver y mismos nombre, puerto y PnP; no garantiza identidad física |
| Ambigua | Más de una candidata del driver sin serial único; incluye dos equipos iguales |
| No encontrada | No hay coincidencia conservadora; requiere revinculación manual |

Nombre de cola, USB003 y PnP son pistas mutables. No se guardan cambios de
asociación por refrescar. Dos impresoras idénticas sin serial no se distinguen
con certeza tras cambiar puertos. La prueba BETA se bloquea si hay ambigüedad;
use las pruebas propias de Windows y etiquetado físico para verificar cada equipo
antes de volver a vincular. Incluso una coincidencia probable puede corresponder
a otro equipo del mismo modelo si fue intercambiado: verificar físicamente.

La prueba muestra destino/contenido, exige confirmación renderer y confirmación
nativa, actualiza inventario antes y después de la confirmación y rechaza cambios.
Envía una página, una copia, `silent: false`, deviceName de una cola detectada;
no modifica la predeterminada. El diálogo nativo permite al operador cambiar
preferencias/destino: debe verificar allí la misma cola y una copia. El programa
no puede garantizar cambios que el usuario haga dentro del diálogo del driver.
Solo una prueba puede estar en curso. Una prueba ya entregada a Windows puede
finalizar aunque se cierre la pantalla; deshabilitar BETA no cancela el spooler.
La prueba de identificación nunca se invoca desde sockets y sigue con diálogo
incluso cuando el modo sin diálogo está activado. No hay agentes ni cambios de drivers.

## Validación reproducible

```sh
node --test apps/desktop/beta-printers/test/*.test.js
find apps/desktop/beta-printers -name '*.js' -exec node --check {} \;
node --check apps/desktop/main.js
git diff --check
```

Las pruebas cubren identidad/collisiones, nombres mutables, corrupción/reinicio,
esquema inválido/escritura fallida, fallback CIM, IPC con origen/frame falsos,
modo OFF sin inventario, CRUD, confirmación/cancelación, ambigüedad, una prueba
concurrente, cambio a OFF durante confirmación, una página no silenciosa y
comparación del handler contra baseline excluyendo únicamente las dos adiciones
para opciones de impresión, y preservación del puente original. Se prueba también
el handler real con dobles Electron: modo con/sin diálogo, payload y márgenes,
cola seleccionada, errores sin reintentos ni ventanas innecesarias, migración de
preferencias, persistencia del check y rechazo de destinos ambiguos/offline. También se prueba que el launcher acepte únicamente el
shell registrado, su frame principal y el origen HTTPS exacto de Vercel, y que ese
remitente siga sin acceso al IPC de configuración.

No se agregaron dependencias. Para el acceso web se ejecutaron el build de
Next.js (incluye TypeScript) y ESLint sobre el componente nuevo:

```sh
npm exec --workspace=frontend -- eslint app/components/PrinterSettings.tsx
npm run build --workspace=frontend
```

Node syntax checks siguen aplicándose al módulo Electron. No se ejecutó Electron gráfico, Windows, PowerShell CIM real,
impresoras físicas ni diálogo del driver en el entorno Linux de implementación.
No se afirma validación física.

Antes de uso operativo, verificar en Windows:

- Inicio OFF, activar/desactivar y reiniciar con perfiles guardados.
- Engranaje visible con el shell remoto real, UI y errores de permisos.
- Inventario de dos equipos iguales, desconexión/cambio de puerto/nueva cola;
  ambigüedad sin reasignación, revinculación manual y prueba bloqueada si ambigua.
- Una prueba con cola inequívoca: cancelar ambos diálogos y luego confirmar;
  verificar físicamente destino, página y copias.
- Check desmarcado: impresión desde app y sockets conserva selector/layout/ack.
- Check marcado: impresión directa al perfil elegido sin selector; comprobar
  destino físico, desconexión, ambigüedad, desmarcar y reiniciar.
- Archivo corrupto no impide iniciar ni imprimir con el flujo tradicional.

## Acceso desde el frontend de Vercel

El componente aislado `frontend/app/components/PrinterSettings.tsx` se monta en
`frontend/app/layout.tsx`; el engranaje es visible en login, dashboard e impresión,
incluso al abrir la URL en un navegador. No cambia sockets ni handlers de impresión.
En navegador muestra un diálogo explicando que el inventario de Windows requiere
Ivoolve Print de escritorio; no simula impresoras ni guarda vinculaciones ficticias.

El preload principal añade `window.ivoolvePrinterSettings.open()` solo en
`https://ivoolve-print-frontend.vercel.app`. El proceso principal verifica además
webContents registrado, frame principal y origen exacto al recibir la llamada.
El launcher no admite rutas, URLs, nombres de impresora ni comandos. Su único
efecto es abrir/enfocar el documento local controlado; no expone el almacén ni
el inventario al frontend remoto. El menú nativo sigue disponible para estaciones
que aún cargan una versión anterior del frontend.

Para ver el engranaje web debe desplegarse este commit del frontend en Vercel.
Para abrir la configuración mediante él también debe actualizarse/reiniciarse
Electron (incluye cambios en preload y registro IPC). Recargar Vercel no actualiza
el binario ni el proceso Electron instalado. El estado del despliegue Vercel debe
confirmarse en la plataforma; un push no acredita por sí solo un despliegue.

## Impresión sin cuadro de diálogo (activación independiente)

Autorización posterior a la fase de inventario: el operador dispone de un check
local persistente «Imprimir sin cuadro de diálogo» y un selector de perfil.
Por defecto está OFF, también al cargar el esquema v1 anterior, sin perder
perfiles. No basta con habilitar BETA: hay que elegir un perfil vinculado y
marcar el check. La configuración solo puede cambiarse desde la ventana local.

El endpoint actual solo produce etiquetas: todos los trabajos que atraviesen
`print-labels` (manuales y recibidos por el flujo existente) usan el perfil elegido
cuando el modo está ON. No se inventa una clasificación Etiquetas/Membretes/Despachos
a partir del payload. La selección se guarda por ID del perfil, permitiendo renombrarlo.

`silent.js` resuelve conservadoramente la asociación; al activar y en cada trabajo
sin diálogo se vuelve a consultar el inventario. No se enumera por trabajo si el
check está OFF. La llamada de impresión original recibe únicamente los overrides
`silent: true` y `deviceName` desde el perfil local. API HTML, payload, márgenes,
layout, callback y ACK permanecen iguales. Si no hay perfil/cola inequívoca o
Windows informa offline, se devuelve error sin imprimir, sin fallback a la
predeterminada ni apertura automática del diálogo y sin reintento que duplique
el trabajo. Desactivar BETA desarma también el check; reactivarla no lo rearma.

Cambios de configuración durante la enumeración abortan el trabajo para evitar
un destino obsoleto. Un trabajo ya aceptado por Electron/Windows no se cancela
por desmarcar después el check. El estado físico online no está garantizado
cuando Windows no lo expone. Dos colas iguales sin serial siguen siendo ambiguas
y no permiten activar el modo sin diálogo. No se infiere identidad física de
USB003 o del nombre de cola. Este modo requiere validación física en Windows.

Para recibir el check es necesario actualizar el repositorio local y reiniciar
Electron; el despliegue de Vercel por sí solo no cambia el código local.

## Interfaz Electron con Tailwind local

La ventana local dispone de cabecera, navegación por secciones en ventanas amplias,
resumen de la estación, tarjetas de dispositivos y perfiles, estados de vinculación,
identificación técnica desplegable, controles del modo de impresión y pantalla OFF.
Iconos SVG locales, fondos claros y acentos rosados; no usa fuentes remotas ni CDN.
Los nombres y metadatos de impresora siguen insertándose mediante `textContent`.
La política CSP y el contrato IPC no cambian. Este cambio visual no modifica
`main.js`, selección de identidad, persistencia ni lógica de impresión.

`tailwind.css` es la fuente; `style.css` es el CSS compilado que se incluye en git
para que Electron pueda abrirlo sin ejecutar un build ni consultar la red.
Se utilizan las dependencias PostCSS/Tailwind ya existentes del monorepo.
Después de modificar HTML, clases de UI o estilos:

```sh
node apps/desktop/beta-printers/build-styles.cjs
node --check apps/desktop/beta-printers/ui.js
node --test apps/desktop/beta-printers/test/*.test.js
git diff --check
```

Verificación visual y funcional de esta interfaz realizada en Chromium headless
con puente IPC simulado: 1100×800 (ventana habitual), 390×844 (ventana estrecha)
y 1400×900 (BETA OFF). Se inspeccionaron capturas y se verificaron tarjetas,
contadores, alta/edición de perfiles, checkbox sin diálogo, refresco y habilitación.
Sin errores JavaScript ni desbordamiento horizontal a 390 px. Esto valida la UI;
no acredita drivers, Electron nativo ni impresoras físicas en Windows.

Para ver el nuevo diseño: actualizar el repositorio local y reiniciar Electron.
No requiere redesplegar el frontend de Vercel ni reinstalar dependencias en una
estación que ya ejecuta la aplicación.
