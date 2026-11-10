# Logs técnicos de ivoolve_print

Sistema centralizado, aislado y persistente de **logs técnicos y operativos** de Electron y de la API local.

> **Alcance.** Esto es diagnóstico técnico. **No** es auditoría de impresiones: no registra quién imprimió, copias, colas ni historial. Un evento `print.*_submitted` significa únicamente que la llamada de impresión terminó sin error técnico (`webContents.print` devolvió `success`, o el trabajo fue aceptado por el diálogo/cola de Windows). **No confirma salida física del papel.**

## Arquitectura

```
apps/shared/logging/     Núcleo en JavaScript puro (sin dependencias): catálogo, saneado,
                         escritor JSONL, logger, lector. Lo cargan Electron y la API con require relativo.
apps/desktop/logging/    Integración con Electron (main): excepciones, ciclo de vida, IPC, impresión,
                         canales logs:* y diagnósticos para el agente Prisma.
apps/api/src/logging/    Integración con NestJS: logger, middleware de correlación, filtro de
                         excepciones y hooks de proceso.
apps/desktop/frontend/app/components/LogsViewer.tsx
                         Botón y módulo "Logs" (solo aparece en la app de escritorio).
```

Flujo de consulta: **UI (Vercel) → `window.ivoolveLogs` (preload) → IPC `logs:*` (main) → lector → archivos locales**. El cliente solo envía filtros (fechas, niveles, categorías, componentes, texto, página); **nunca rutas**. No hay endpoint de red para leer logs y funciona sin conexión.

## Directorios de logs

Raíz resuelta de forma coherente en ambos procesos:

1. `IVOOLVE_PRINT_LOG_DIR`, si está definida.
2. `<userData de Electron>\logs` (en Windows: `%APPDATA%\desktop\logs`).
3. La API, sin Electron, usa `%APPDATA%\desktop\logs` (el nombre `desktop` es el de la app Electron).

```
<raíz>\electron\electron-YYYY-MM-DD[.N].jsonl   (Electron main + eventos de la interfaz)
<raíz>\api\api-YYYY-MM-DD[.N].jsonl             (API NestJS)
```

El día del nombre de archivo es **UTC**. Nunca se escribe en el código fuente, `dist` ni `node_modules`.

## Contrato de evento (JSON Lines, un objeto por línea)

```json
{"timestamp":"2026-11-10T12:30:00.000Z","level":"error","category":"connection","event":"backend.request_failed",
 "message":"Tiempo de espera agotado al llamar al backend","component":"electron","process":"main",
 "correlation_id":"…","station_id":"…","duration_ms":5000,
 "metadata":{"action":"claim","timeout":true,"consecutive_failures":2},
 "error":{"name":"TimeoutError","code":"ETIMEDOUT","message":"…","stack":"…"}}
```

Los campos opcionales se omiten si no hay datos. `timestamp` es UTC ISO 8601; la UI lo muestra en la hora local del equipo. `error` incluye `message` además de `name`/`code`/`stack`.

**Severidades:** `debug`, `info`, `warn`, `error`, `fatal`. En producción solo se escribe desde `info`; `debug` requiere `IVOOLVE_PRINT_LOG_LEVEL=debug`.

**Categorías:** `execution`, `error`, `printing_technical`, `connection`, `polling`, `configuration`, `security`, `system`.

## Catálogo de eventos (`dominio.accion_resultado`)

| Categoría | Eventos |
|---|---|
| execution | `app.started`, `app.ready`, `app.stopping`, `app.stopped`, `window.created`, `window.closed`, `window.responsive`, `api.listening` |
| error | `error.uncaught_exception`, `error.unhandled_rejection`, `api.listen_failed`, `api.request_failed`, `ipc.handler_failed`, `window.render_process_gone`, `window.unresponsive`, `child_process.gone`, `ui.error_unhandled` |
| printing_technical | `print.labels_submitted`, `print.labels_failed`, `print.letterhead_submitted`, `print.letterhead_failed`, `print.letterhead_ambiguous`, `prisma.supervised_claimed`, `prisma.supervised_outcome`, `prisma.supervised_failed` |
| connection | `backend.request_failed`, `backend.request_recovered`, `prisma.complete_failed`, `window.load_failed`, `socket.connected`, `socket.disconnected`, `socket.connect_failed`, `socket.join_rejected` |
| polling | `polling.started`, `polling.stopped`, `polling.failed`, `polling.recovered` |
| configuration | `config.loaded`, `config.changed`, `config.change_rejected`, `config.station_id_unwritable` |
| security | `security.origin_rejected`, `security.auth_rejected`, `security.input_rejected` |
| system | `system.signal_received`, `log.events_dropped`, `log.write_failed`, `log.retention_applied`, `log.read_failed`, `log.exported`, `log.invalid_event` |

La lista canónica con descripciones está en `apps/shared/logging/catalog.js`. Un nombre fuera del formato se guarda como `log.invalid_event` (no se pierde el registro).

## Qué se registra y qué no

- **Polling:** solo transiciones (`polling.started`, primer fallo y luego fallos en potencias de 2 / cada 64, `polling.recovered` con el total de fallos). **Nunca un registro por ciclo exitoso.** El mismo muestreo se aplica a errores del backend y del socket.
- **Impresión:** resultado técnico de cada intento con `correlation_id`, duración y motivo del fallo. No se registran contenidos de etiquetas, PDFs, números de documento ni tokens.
- **Correlación:** Electron genera un `correlation_id` por intento de impresión y lo envía como `X-Correlation-Id` **solo a la API local** (no al backend remoto). La API lo propaga a sus logs y lo devuelve en la respuesta. Los trabajos supervisados usan `prisma-job-<id>`.
- **Redacción:** nunca se guardan tokens/JWT/`Bearer`, contraseñas, cookies, claves, `payload`/`body`, `base64`, data URIs, PDFs/HTML, correos, teléfonos, query strings de URL ni credenciales en URL. Las rutas de usuario de Windows se anonimizan. Límites: 500 caracteres por texto, 4 niveles de profundidad, 30 claves, 20 elementos por arreglo, 16 KB por línea. El lector **vuelve a sanear** al leer, así que un archivo manipulado tampoco filtra secretos.

## Configuración (variables de entorno)

| Variable | Defecto | Rango |
|---|---|---|
| `IVOOLVE_PRINT_LOG_DIR` | ver arriba | ruta |
| `IVOOLVE_PRINT_LOG_LEVEL` | `info` | `debug`…`fatal` |
| `IVOOLVE_PRINT_LOG_RETENTION_DAYS` | `14` | 1–365 |
| `IVOOLVE_PRINT_LOG_MAX_MB` | `250` (total, ambas fuentes) | 10–5000 |
| `IVOOLVE_PRINT_LOG_FILE_MB` | `10` (rotación por tamaño) | 1–100 |

## Rotación, retención y confiabilidad

- Un archivo por día y por proceso; al superar el tamaño máximo se rota a `…YYYY-MM-DD.1.jsonl`, `.2`, etc.
- La retención corre al arrancar y cada 6 horas: borra archivos más antiguos que los días configurados y, si se excede el tope global, los más antiguos primero. **Nunca borra el archivo del día actual.**
- La escritura es **asíncrona con cola acotada** (2000 eventos / 2 MB). Si la cola se llena o el disco falla, el evento se descarta, se **cuenta** y se informa en el siguiente log disponible (`log.events_dropped`); el aviso local va a stderr, como máximo uno por minuto, sin usar el propio logger (sin recursión). **Un fallo de registro nunca detiene ni cambia la impresión.**
- Las excepciones se observan con `uncaughtExceptionMonitor`/`unhandledRejection` **sin cambiar el comportamiento por defecto**: un fallo fatal sigue terminando el proceso. La misma excepción no se registra dos veces.
- Cierre limpio: `app.stopping` y `app.stopped` (con código de salida). Si el proceso se mata a la fuerza (`taskkill /F`, cierre de la ventana de la consola de la API en Windows) no hay marca de cierre; su ausencia indica un cierre no limpio.

## Módulo "Logs" en la interfaz

Botón **Logs** en la esquina superior derecha, junto a «Impresoras BETA» (solo aparece si existe `window.ivoolveLogs`, es decir, dentro de Ivoolve Print de escritorio actualizado). Ofrece tabla compacta, filtros de periodo/severidad/categoría/componente/texto, paginación (50 por página, máx. 5000 resultados por consulta), detalle con `correlation_id` copiable, actualización manual y exportación **saneada** a JSONL o CSV mediante el cuadro «Guardar como» del sistema (la ruta no se expone a la página). Si hay demasiados registros, la lectura se acota (máx. 500 000 líneas / 8 s) y la UI lo indica.

**Acceso:** los canales `logs:*` exigen que la llamada venga del marco principal de la ventana de Electron creada por la app y del origen del frontend autorizado (`runtime-config.js`); en cualquier otro caso se rechazan y se registra `security.origin_rejected`. No se aplica control por rol de usuario porque los roles viven en el backend remoto y los logs son diagnóstico local del equipo.

## Diagnóstico rápido

1. Abrir **Logs** → filtrar `Error o superior` y el periodo del incidente.
2. Copiar el `correlation_id` de un fallo de impresión y buscarlo: aparecen los eventos de Electron y de la API del mismo intento.
3. Sin interfaz: abrir `%APPDATA%\desktop\logs\electron` y `\api` (JSON Lines, un evento por línea).
4. «Polling falla» repetido + `backend.request_failed`/`security.auth_rejected` → revisar red o sesión vencida.
5. `log.events_dropped` → la cola se llenó o el disco falló; revisar espacio y permisos.

## Pruebas

```bash
npm run build --workspace=api     # las pruebas de la API usan dist/
npm run test:logging
```

Cubren saneado, contrato, rotación, retención, backpressure, fallo de disco, volumen sostenido (20 000 eventos), lectura multi-archivo, filtros, paginación, exportación, IPC, autorización de `logs:*`, filtro de excepciones y hooks de proceso.

## Limitaciones conocidas

- La verificación visual de la interfaz en navegador/Electron no se realizó en esta fase; se validó con `tsc` y `eslint`.
- `apps/shared/logging` está fuera de `apps/desktop`: si en el futuro se empaqueta Electron (electron-builder), hay que incluirlo en los archivos del paquete.
- No hay envío remoto de logs ni tablas en Laravel (fuera de alcance).
- Los logs del frontend se limitan a errores no controlados del renderer (máx. 20 por minuto).
