# Prisma · Asistente de impresión

Prisma está disponible desde el dashboard de Ivoolve Print, dentro de Electron. Solo prepara etiquetas por código de etiqueta y cantidad explícita, y membretes por número diario de despacho de hoy (America/Bogota).

## Uso

- «Imprime 3 etiquetas del código 123».
- «Imprime el membrete 02».
- «Imprime los membretes 02 y 03»: exige revisar la lista y pulsar Imprimir.
- Si falta información, responde en el mismo chat. Las solicitudes aclaradas requieren confirmación.
- Si hay varios despachos del mismo número, selecciona uno. El resto de la solicitud espera; Cancelar pendientes conserva el estado de los trabajos ya enviados.

Cada documento utiliza su perfil actual: destino, activación, medidas, calibración y modo silencioso. Un perfil inválido detiene el proceso; no se selecciona otra impresora ni se reintenta automáticamente. Un envío exitoso indica aceptación por la cola, no salida física del papel.

## Instalación

1. Desplegar primero el cambio de `ivoolveFlow` descrito en `docs/printing-agent/README.md`.
2. Actualizar este repositorio: `git pull --ff-only origin main`.
3. Ejecutar `npm ci` y reiniciar con `npm exec --workspace=desktop -- electron .`.
4. Esperar el despliegue del frontend en Vercel y comprobar ambos perfiles en la estación Windows.

Prisma necesita el backend Laravel actualizado, su configuración Gemini existente y caché persistente compartida entre trabajadores PHP. No introduce variables de entorno, migraciones ni dependencias nuevas. El servicio local de etiquetas en `localhost:3031` debe seguir funcionando como en la búsqueda manual.

## Aislamiento y recuperación

El módulo nuevo reside en `apps/desktop/prisma-agent/` y `frontend/modules/prisma/`. Reutiliza los handlers existentes de etiquetas y PDF; no cambia sus plantillas. El puente IPC acepta solo la ventana principal registrada y el origen HTTPS autorizado. El modelo no recibe credenciales ni controla URLs, dispositivos o código.

Los planes duran dos minutos, pertenecen al usuario y se reclaman una sola vez antes de imprimir. Si se interrumpe una solicitud, revisar la cola física antes de enviar otra. El historial vive únicamente en memoria de la sesión. Los buscadores manuales permanecen disponibles si Prisma falla.

## Validación

`node --test apps/desktop/prisma-agent/test/*.test.js apps/desktop/beta-printers/test/*.test.js apps/desktop/dispatch-print/test/*.test.js`

También se verificaron el build Next/TypeScript, lint de los dos archivos nuevos y UI con puente simulado en escritorio/móvil. El dashboard original mantiene incidencias previas de lint. Falta validar impresoras físicas, credenciales Gemini y el despliegue real de Laravel en producción.
