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

Las frases `Imprime membrete 02` e `Imprime etiqueta 123` son **simulaciones**. Laravel consulta primero las fuentes reales de la aplicación (despachos activos del día en zona `America/Bogota` para membretes y código exacto de `ProductBarCode` para etiquetas). Si el documento no existe, responde sin enviar señal. Si hay varios despachos con el mismo número, pide seleccionar el ID mediante `Imprime membrete 02 despacho 77` (o `el 77` como respuesta inmediata en el chat PWA). Si existe uno, solo emite una señal numerada y espera el acuse de Electron. El panel de Print muestra el documento debajo de las luces **solo después del acuse exitoso**. No genera PDF, HTML ni llama a Windows Print.

El endpoint de ejecución `claim` sigue bloqueado con HTTP 423. El runtime Prisma no llama al spooler; la impresión manual permanece como estaba.

## Preparación
1. Desplegar cambios de `ivoolveFlow`, ejecutar migración aditiva `2026_10_26_090000_create_prisma_connectivity_tables.php`.
2. Desplegar frontend Next de Print (Vercel).
3. En cada estación Windows ejecutar `git pull --ff-only origin main`, `npm ci` en la raíz y reiniciar Electron con `npm exec --workspace=desktop -- electron .` (o mediante el método normal instalado).
4. Abrir Print, iniciar sesión, comprobar luz **Conexión**. Recargar la interfaz remota y reiniciar Electron tras actualizar; una estación sin el frontend actualizado puede dejar señales numeradas sin acuse.
5. Enviar cada una de las tres frases de prueba desde el chat PWA o WhatsApp. Confirmar que la luz correspondiente se ilumine y que desde el chat PWA aparezca el acuse de la estación.
6. Enviar `Imprime membrete 02` **cuando no haya un despacho 02 hoy**: Prisma debe responder `No encontré el membrete 02...`, sin señalar a Electron. Probar luego un código de etiqueta existente y otro inexistente. Solo las coincidencias deben generar señal, y únicamente el acuse auténtico debe mostrar la simulación completada.

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
