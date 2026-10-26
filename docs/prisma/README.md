# Prisma · Diagnóstico y simulación validada (sin impresión real)

## Objetivo de esta fase
Ivoolve Print presenta **4 luces** en su dashboard:
- **Conexión**: heartbeat autenticado Electron → Laravel (cada ~3,5 segundos).
- **Etiqueta**: se enciende al recibir y confirmar `Prueba etiqueta`.
- **Membrete**: se enciende al recibir y confirmar `Prueba membrete`.
- **Canal**: se enciende al recibir y confirmar `Prueba canal` (también acepta `Prueba conexión`).

Las luces de prueba se apagan tras 18 segundos. Laravel solo considera una estación en línea si su heartbeat tiene menos de 25 segundos. Los eventos caducan a los 50 segundos. Se requiere un acuse de Electron para considerarlos recibidos; **ninguna prueba genera HTML, PDF, cola Windows o trabajo físico**.

## Orígenes de señales
1. **Chat del agente en IvoolveFlow:** `/dashboard/agents/prisma` → pestaña Chat → Abrir chat.
2. **WhatsApp dedicado a Prisma:** misma PWA → pestaña WhatsApp → vincular sesión `agent_prisma` y autorizar remitentes.
3. **Chat del propio Ivoolve Print:** botón Prisma en dashboard.

Los comandos `Prueba etiqueta`, `Prueba membrete` y `Prueba canal` solo prueban el transporte.

Las frases `Imprime membrete 02` e `Imprime etiqueta 123` son **simulaciones**. Laravel consulta primero las fuentes reales de la aplicación (despachos activos del día en zona `America/Bogota` para membretes y código exacto de `ProductBarCode` para etiquetas). Si el documento no existe, no emite una simulación; publica únicamente un aviso informativo de búsqueda fallida para mostrarlo en rojo bajo las luces. Si hay varios despachos con el mismo número, pide seleccionar el ID mediante `Imprime membrete 02 despacho 77` (o `el 77` como respuesta inmediata en el chat PWA). Si existe uno, solo emite una señal numerada y espera el acuse de Electron. El panel de Print muestra el documento debajo de las luces **solo después del acuse exitoso**. No genera PDF, HTML ni llama a Windows Print.

## Búsqueda por producto y variante (etiquetas)
Tanto el chat de Prisma (PWA, WhatsApp y nota de voz) como la búsqueda manual de **Etiqueta** aceptan `Imprime etiqueta Body Barbie Rojo`, `Imprimir etiqueta a Body Barbie (color / Variante) Rojo` o, en el buscador manual, simplemente `Body Barbie Rojo`. Los códigos numéricos existentes siguen funcionando.

La resolución es **de solo lectura** sobre `store_products`, `store_products_ingredients` y `product_bar_codes`; valida producto exacto, variante y código real. Si hay varias etiquetas, pide seleccionar el código y no elige arbitrariamente. Si falta, no fabrica códigos. Al encontrarla, Print muestra en **verde** «Body Barbie conseguido · Variante Rojo · Código 381»; si no existe, muestra en **rojo** el nombre solicitado y, si estaba indicado, el código no encontrado. Las notificaciones rojas son `kind=lookup` y **no iluminan falsamente el bombillo Etiqueta**.

El buscador manual consulta `POST /api/v1/printing-agent/labels/lookup` autenticado, muestra candidatos si corresponde y reusa `/dashboard/production-order` con método `tag` al seleccionar un código. **Buscar no imprime**: el botón manual de impresión permanece separado y conserva su funcionamiento original. El agente, incluso con etiqueta encontrada, permanece en simulación sin impresión real.

El transporte de los resultados requiere la migración aditiva `2026_10_26_160000_add_prisma_label_lookup_status.php` (metadatos de estado, nombre, variante y texto solicitado), además de la migración anterior `2026_10_26_130000_add_prisma_simulation_document_number.php`. Hay que desplegar Laravel antes de probar el frontend nuevo. Reiniciar Electron después de actualizar para admitir `kind=lookup`.

El endpoint de ejecución `claim` sigue bloqueado con HTTP 423. El runtime Prisma no llama al spooler; la impresión manual permanece como estaba.

## Preparación
1. Desplegar cambios de `ivoolveFlow`, ejecutar migración aditiva `2026_10_26_090000_create_prisma_connectivity_tables.php`.
2. Desplegar frontend Next de Print (Vercel).
3. En cada estación Windows ejecutar `git pull --ff-only origin main`, `npm ci` en la raíz y reiniciar Electron con `npm exec --workspace=desktop -- electron .` (o mediante el método normal instalado).
4. Abrir Print, iniciar sesión, comprobar luz **Conexión**. Recargar la interfaz remota y reiniciar Electron tras actualizar; una estación sin el frontend actualizado puede dejar señales numeradas sin acuse.
5. Enviar cada una de las tres frases de prueba desde el chat PWA o WhatsApp. Confirmar que la luz correspondiente se ilumine y que desde el chat PWA aparezca el acuse de la estación.
6. Enviar `Imprime membrete 02` **cuando no haya un despacho 02 hoy**: Prisma debe responder `No encontré el membrete 02...`, sin señalar a Electron. Probar luego un código de etiqueta existente y otro inexistente. Las coincidencias generan simulación; las negativas solo una notificación roja sin trabajo de impresión, y únicamente el acuse auténtico confirma su recepción.

La estación usa un UUID guardado en `app.getPath('userData')/prisma-station.id`, separado de los perfiles de impresora. El UUID no se expone por el preload al frontend remoto. La API de Prisma usa el JWT del usuario y valida origen/ventana IPC. El backend mantiene una lista blanca para WhatsApp.

## Fuera de alcance
No se habilitó impresión automática ni IA con acceso a impresoras. Los perfiles, tamaños, silent/dialog, búsqueda manual y spooler de Windows mantienen su comportamiento actual. El heartbeat no acredita conectividad con una impresora física ni con Gemini. El push a GitHub y un build Vercel tampoco prueban por sí solos Laravel, Baileys o las estaciones Windows.

## Tests
```bash
node --test apps/desktop/prisma-agent/test/*.test.js \
  apps/desktop/beta-printers/test/*.test.js \
  apps/desktop/dispatch-print/test/*.test.js
npm run build --workspace=frontend
```

Si el backend no tiene las migraciones o una estación Windows no está ejecutando el Electron actualizado, las luces deben permanecer apagadas.
