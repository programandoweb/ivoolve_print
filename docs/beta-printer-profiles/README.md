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
El handler completo `print-labels`, su puente `window.api.print`, Socket.IO, API
y plantillas quedan idénticos. No se modificó `ivoolveFlow`.

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
6. Desactivar el interruptor para dejar de usar BETA; los perfiles se conservan.

Desactivada, no enumera impresoras ni ejecuta PowerShell. La configuración se
lee de forma diferida al abrir la ventana. No existen timers, suscripciones de
hardware ni integración con trabajos normales. La persistencia de la activación
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
  Todo efecto de configuración BETA requiere activación.
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
Nunca se invoca la prueba desde sockets ni se consumen estos perfiles al imprimir
etiquetas normales. No hay impresión silenciosa, agentes ni cambios de drivers.

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
comparación byte a byte del handler legado y preservación del puente de impresión
original contra baseline. También se prueba que el launcher acepte únicamente el
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
- Impresión habitual desde app y sockets conserva selector/layout/ack.
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
