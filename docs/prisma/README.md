# Prisma · Asistente de impresión

Prisma está integrado en el dashboard de Ivoolve Print y el controlador Electron, con configuración persistente aislada en Laravel. La pantalla administrativa es `/dashboard/agents/prisma` en IvoolveFlow (requiere permiso `agents.catalog.manage`).

## Instalación
1. Desplegar IvoolveFlow (`/var/www/deploy-ivoolve-flow.sh`) y ejecutar la migración aditiva `2026_10_24_150000_create_printing_agent_settings_table.php` con `php artisan migrate --force` en backend; comprobar rutas y permisos.
2. Confirmar `GEMINI_API_KEY` y caché persistente compartida. Abrir Prisma en administración, revisar el modelo y pulsar **Probar conexión real**. Credencial y errores del proveedor nunca se entregan al frontend.
3. Actualizar Electron (`git pull --ff-only origin main && npm ci`) y reiniciar desde los scripts existentes; actualizar el frontend remoto mediante su despliegue habitual Vercel.
4. En cada estación Windows, comprobar los perfiles Etiquetas y Membretes, la cola seleccionada y el modo silencioso. **No se ejecuta ningún trabajo físico automáticamente al instalar.**

## Uso
- «Imprime 3 etiquetas del código 123».
- «Imprime el membrete 02».
- «Imprime los membretes 02 y 03»: confirmar la lista.
- Si hay coincidencias múltiples, elegir una; cancelar no repite trabajos emitidos.

El mensaje "enviado a la cola" no certifica salida física. Ante timeout o resultado incierto, revisar el spooler antes de enviar otra orden. La impresión manual sigue disponible aunque Prisma esté desactivado o falle Gemini.

## Aislamiento
`apps/desktop/prisma-agent` conserva las únicas dos clases de trabajo y el puente IPC por ventana/origen, y no reconfigura otros agentes. El estado se obtiene mediante GET autenticado a `/api/v1/printing-agent/status`. Perfil, medidas y orientación se determinan exclusivamente por los handlers Electron ya existentes.

## Validaciones pendientes
Ejecutar `node --test apps/desktop/prisma-agent/test/*.test.js apps/desktop/beta-printers/test/*.test.js apps/desktop/dispatch-print/test/*.test.js`, tests PHP, Next build y pruebas físicas en Windows. Los commits no equivalen a despliegue Vercel/Windows ni acreditan que el proveedor esté conectado.
