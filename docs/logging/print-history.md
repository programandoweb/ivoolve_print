# Historial de impresiones de ivoolve_print

Trazabilidad de **quién mandó a imprimir y qué**: tipo, lote, documento, cantidades, estado final y motivo del fallo. Tiene su propio botón **Historial** y es **independiente de los logs técnicos** (`docs/logging/README.md`): carpeta, módulo, retención y contenido distintos.

> **Qué significa "Enviado".** La llamada de impresión terminó sin error técnico: Windows (diálogo/cola) aceptó el trabajo. **No confirma que el papel haya salido.** Por eso el estado se llama «Enviado», no «Impreso».

## Qué se registra por cada intento

| Dato | Detalle |
|---|---|
| Cuándo | `requested_at`, `finished_at` (UTC; la UI muestra hora local) y `duration_ms` |
| Quién | `actor`: id, nombre, rol y **`source`** (ver abajo) |
| Qué | `kind` (`labels` / `letterhead`), `origin`, **lote** (`batch_code`), abreviatura, número de requisición, número de membrete/despacho, id de orden de producción, **cantidad total** y detalle por ítem (código, producto, variante, cantidad; máx. 40 filas, el total cuenta todas) |
| Resultado | `status` y `reason` (motivo del fallo en texto), páginas/ajuste en membretes |
| Contexto | estación (`station_id`), `job_id` y `job_source` de Prisma, si fue sin diálogo (`silent`), `correlation_id` (cruza con **Logs**) |

**Estados:** `submitted` (Enviado), `failed` (Falló), `cancelled` (Cancelado; solo cuando Electron lo informa explícitamente), `ambiguous` (varios despachos; no se imprimió), `pending` (en curso), `interrupted` (sin cierre tras 10 min: la app se cerró o falló durante la impresión).

**Orígenes:** `manual_labels`, `manual_letterhead` (botones de la PWA), `prisma_assistant` (asistente), `prisma_supervised` (trabajos de la cola de Laravel: WhatsApp, chat, PWA).

## Quién imprimió

1. **Quien pidió el trabajo** (`job_requester`): si Laravel incluye `requested_by` (`{id, name}`) en el trabajo supervisado, se usa.
2. **Usuario logueado en la estación** (`logged_in_user`): *fallback*. La PWA informa a Electron el usuario de `localStorage` (`id`, `name`, `role`; **nunca correo ni token**) mediante `ivoolvePrintHistory.setActor`, y se actualiza al cambiar de sesión.
3. **`unknown`** si nadie ha iniciado sesión: no se inventa una persona.

> Es una **atribución de la estación**, no una prueba criptográfica de identidad (el nombre lo informa la interfaz). Para trabajos de Prisma que llegan por WhatsApp/chat, mientras Laravel no envíe `requested_by`, el historial muestra al operador logueado en esa estación y deja `job_id`/`job_source` para cruzar con el pedidor real en `printing_agent_print_jobs.requested_by`.

## Almacenamiento

```
<userData>\print-history\records\prints-YYYY-MM-DD[.N].jsonl      (Windows: %APPDATA%\desktop\print-history)
```

JSON Lines **append-only, dos líneas por intento**: `phase:"requested"` al empezar y `phase:"finished"` al terminar. Así, un intento que nunca cerró queda visible como `interrumpido` en vez de perderse. El lector fusiona ambas líneas por `attempt_id`.

- Retención **365 días** (`IVOOLVE_PRINT_HISTORY_RETENTION_DAYS`, 1–3650) y tope **500 MB** (`IVOOLVE_PRINT_HISTORY_MAX_MB`). Ruta alternativa: `IVOOLVE_PRINT_HISTORY_DIR`.
- Escritura asíncrona con vaciado inmediato; cola amplia (10 000). Un fallo del disco **nunca detiene ni cambia la impresión**: el resultado devuelto al llamador es idéntico (cubierto por pruebas).
- Es un archivo **local de la estación**. No se sincroniza con Laravel (ver Pendientes).

## Privacidad

No se guardan tokens, correos, contenido de PDFs/HTML ni cuerpos de solicitudes. Los textos se acotan y se **vuelven a sanear al leer**. La exportación (CSV/JSONL) usa el cuadro «Guardar como» del sistema; la página nunca recibe rutas. El nombre del usuario va **solo** al historial, no a los logs técnicos.

## Acceso

Canales `print-history:*` solo desde el marco principal de la ventana de Electron y el origen del frontend autorizado (mismo control que `logs:*` y el engranaje de impresoras); si no, se rechaza y se registra `security.origin_rejected`. No se aplica control por rol de usuario (los roles viven en el backend remoto).

## Interfaz

Botón **Historial** (junto a «Logs» y «Impresoras BETA»; solo dentro de Ivoolve Print de escritorio actualizado). Tabla con fecha, quién, tipo, documento/lote, origen, cantidad y estado; filtros por periodo, tipo, estado, origen y búsqueda (persona, lote, documento, código); resumen por estado y unidades enviadas; detalle por intento con motivo, ítems, estación y `correlation_id` copiable; exportación CSV/JSONL. Máx. 5000 resultados por consulta.

## Pruebas

```bash
npm run test:print-history
```

## Limitaciones / pendientes

- **Local, no central.** Si hay varias estaciones, cada una guarda su historial. Una vista consolidada requeriría enviar los registros a Laravel (tabla durable en el backend), fuera de esta fase.
- Laravel debería incluir `requested_by` (id y nombre) en el trabajo de `station/print/next` para atribuir con precisión los pedidos por WhatsApp/chat.
- No registra la impresora física elegida en el diálogo de Windows (Electron no la expone de forma fiable).
- La verificación visual de la interfaz no se realizó en navegador; se validó con `tsc` y `eslint`.
