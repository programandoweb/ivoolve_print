# Membretes: número de despacho del día → PDF original → impresora

## Uso

1. Actualizar el repositorio, instalar dependencias y reiniciar Electron:

   ```sh
   git pull --ff-only origin main
   npm ci
   npm exec --workspace=desktop -- electron .
   ```

2. En Impresoras BETA habilitar la estación. En el perfil deseado guardar su
   impresora y seleccionar **Recibir membretes de despachos**. El perfil Membretes
   existente se selecciona automáticamente al migrar si conserva ese nombre.
3. Activar Perfil activo y, si se desea, Impresión silenciosa. Se conservan las
   medidas 101 × 24 mm y la confirmación de cola de impresoras idénticas.
4. Iniciar sesión en la app remota cargada por Electron. Abrir **Membretes**,
   escribir el número del listado (ej. `02`) y pulsar Enter.
5. Una coincidencia del día imprime inmediatamente. Si hay varias, seleccionar
   el despacho. Silencioso OFF abre el diálogo Windows; ON usa la cola guardada.

La web desplegada en Vercel presenta el buscador, pero necesita el nuevo preload
Electron para comunicarse con impresoras. Recargar Vercel no actualiza el código
local. No hay impresión silenciosa desde un navegador normal ni se descargan
impresoras a Vercel. `npm ci` es necesario en esta actualización por PDF.js.

## Consulta de solo lectura

No se modifica `ivoolveFlow`, Laravel, su PDF, base de datos, autenticación ni
sockets. Se inspeccionaron sus rutas/controlador/repositorio en modo lectura.
El flujo consulta exclusivamente GET del backend configurado en el código:

- `/api/v1/dashboard/dispatches?search=02&per_page=100&page=N`
- `/api/v1/dashboard/dispatches/{id}`
- `/api/v1/pdf/print-dispatch?value=<order_number>`

El listado proporciona `Orden` (dispatch_order_number), `id`, `Tipo` y
`dispatch_order_ref`; se contrasta con el detalle. El parámetro `value` del PDF
es `order_number`, nunca el número diario ni el ID. La fecha se toma de
`dispatch_order_por`, nunca de la fecha de creación o de la columna Fecha.
La fecha actual se calcula en America/Bogota; los timestamps ISO/UTC se convierten.
Los timestamps locales sin zona corresponden a la zona de la aplicación Laravel.

El endpoint existente ordena por fecha de despacho DESC. Se pagina y verifica
el límite de días con los detalles; se detiene tras alcanzar un día anterior o
el final del listado. Se filtra por número exacto, status dispatch y día actual.
No se imprime un resultado parcial si falla una página o la consulta excede sus
límites (25 páginas, 200 detalles, 120 s de consulta; timeout 15 s por petición).
Si hay coincidencias múltiples no se elige la primera: se muestra selección,
se repite la búsqueda y se revalida el ID elegido. Cambios de fecha/referencia
antes de descargar, cambio de día y datos incompatibles bloquean el envío.

Solo se consultan pedidos que aún aparecen en el listado de despachos; no se
hace una búsqueda por estados históricos o finalizados ajenos a ese listado.

## PDF, formato y tamaño físico

Se descarga el PDF original; no se replica la plantilla, se reconstruyen textos
ni se cambia el contenido en Laravel. Se renderizan sus páginas a canvas usando
**pdfjs-dist 6.4.299**, fijado en package-lock y como dependencia exacta de desktop.
Se usa el build legacy para compatibilidad con el Chromium de Electron 41.

El PDF de ejemplo público proporcionado en la sesión se verificó: página de
283 × 283 puntos (~100 × 100 mm). El perfil Membretes es 101 × 24 mm. No es
posible llenar ese papel con el PDF cuadrado conservando simultáneamente tamaño
real, contenido completo y proporción. Se aplica un ajuste proporcional hacia
abajo (sin deformar ni recortar por defecto): el PDF completo ocupa 24 × 24 mm,
centrado horizontalmente. Se informa en el resultado cuando hubo reducción.
Para un membrete grande y legible de formato cuadrado, configurar papel acorde
al PDF en el perfil y en Windows. No se cambia el preset sin acción del operador.

El renderer usa las medidas, márgenes y offsets guardados del perfil para colocar
cada página. Se respeta el contenido y el orden del PDF, una copia de todas sus
páginas (máximo 20). No amplía el original por encima del 100 %. Los márgenes se
aplican en el contenedor; en la llamada Electron se usan márgenes cero para no
aplicarlos dos veces. Offsets configurados por el usuario pueden recortar el área
visible; validarlos con calibración. En modo Windows debe coincidir el tamaño
del driver con las medidas de referencia guardadas. El driver puede imponer sus
límites físicos; sigue pendiente la prueba real en Windows.

No se usa el visor PDF de Chromium para evitar carreras que impriman el visor o
una página vacía. El proceso principal espera la señal explícita de PDF renderizado,
fuentes listas y dos frames pintados antes de imprimir; aborta ante error o a los
45 s. Límites: PDF 15 MB, respuesta JSON 2 MB, área por documento 40 millones de
píxeles. La ventana temporal se cierra y se descartan bytes al terminar/cancelar.
No se escriben PDFs de clientes en disco.

## Aislamiento y seguridad

- `dispatch-print/` encapsula servicio GET, IPC, protocolo de assets y renderer.
- `ivoolveDispatchPrint.run({ number, token, dispatchId? })` se expone únicamente
  al origen HTTPS exacto de Vercel. Se exige shell registrado y frame principal.
  El token permanece en memoria durante la petición; no se persiste, imprime ni
  registra. El PDF público se solicita sin bearer. No se siguen redirecciones.
- Las URLs se construyen en main. El renderer remoto no elige URLs, comandos,
  rutas, nombres de impresora, tipo de trabajo ni opciones de silencio.
- `ivoolve-dispatch://print/` sirve únicamente HTML/JS/CSS propios y recursos de
  PDF.js permitidos. No acepta rutas arbitrarias, credenciales en URL ni métodos
  de escritura. El protocolo no sirve documentos de clientes.
- Los bytes del PDF solo se entregan una vez al frame principal de la ventana
  temporal exacta. Sandbox/contextIsolation ON, nodeIntegration OFF, navegación,
  popups y webviews bloqueados. PDF JavaScript no se ejecuta; no hay anotaciones
  con enlaces interactivos. CSP local y recursos empaquetados sin CDN.
- Solo se usa el perfil `letterheadProfileId`, independiente de `labelsProfileId`.
  Perfil inactivo/inexistente, origen no permitido, cola ambigua/offline o cambios
  durante preparación detienen el trabajo. No hay fallback al perfil Etiquetas.
- Doble Enter se bloquea en UI y main. No se reintenta automáticamente un trabajo
  fallido/cancelado. Repetir Enter después de finalizar es una reimpresión explícita.
  Cerrar el drawer no cancela un trabajo que ya fue solicitado a main/Windows.

## Archivos existentes modificados

- `main.js`: registra protocolo/módulo y shell; handler `print-labels` intacto.
- `preload.js`: añade un puente nominado para membretes; `api.print` intacto.
- `beta-printers/core.js`, `index.js`, `preload.js`, `ui.js`: destino independiente
  de Membretes, radio local y resolución del plan por tipo; conserva flags/papel.
- `frontend/app/dashboard/page.tsx`: monta LetterheadSearch en el drawer existente,
  oculta la búsqueda genérica de etiquetas en ese modo y permite scroll. Solo el
  drawer Membretes queda sobre el engranaje para que Cerrar funcione en móvil.
- `desktop/package.json` y `package-lock.json`: dependencia PDF.js exacta, sin
  actualizaciones masivas. Pruebas del main adaptadas para aislar el nuevo registro.

## Validación

```sh
node --test apps/desktop/beta-printers/test/*.test.js apps/desktop/dispatch-print/test/*.test.js
npm exec --workspace=frontend -- eslint app/dashboard/LetterheadSearch.tsx
npm run build --workspace=frontend
git diff --check
```

34 pruebas con dobles: fecha Bogotá/UTC, número exacto, paginación, duplicados,
selección, datos obsoletos, autenticación, PDF inválido/límites, origen/frame,
recursos locales, doble Enter, errores, ausencia de retry y perfil Membretes
independiente con el preset 101 × 24 mm. Se mantiene la regresión del flujo etiquetas.

Chromium real: UI en escritorio/móvil con IPC simulado (Enter, selección de
coincidencias, no encontrado, cierre y búsqueda Etiqueta posterior), y renderizado
con worker/fuentes del PDF original de muestra en modo 101 × 24 mm. Canvas no vacío,
una página completa, ajuste proporcional y sin errores JavaScript en esa prueba.
Build Next/TypeScript y lint del componente pasan. No se probaron una sesión JWT
real de despachos, el protocolo en Electron nativo ni impresoras físicas Windows;
no se afirma impresión física verificada.
