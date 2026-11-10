'use strict'
// Catálogo estable de logs técnicos de ivoolve_print.
// Categoría y severidad son dimensiones distintas. Los nombres de evento siguen
// el formato `dominio.accion_resultado` y se documentan en docs/logging/README.md.
// IMPORTANTE: esto NO es auditoría de impresiones ni confirma salida física.

const LEVELS = Object.freeze(['debug', 'info', 'warn', 'error', 'fatal'])
const LEVEL_RANK = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40, fatal: 50 })

const CATEGORIES = Object.freeze([
  'execution', 'error', 'printing_technical', 'connection', 'polling', 'configuration', 'security', 'system',
])

// Quién emite el evento (no necesariamente quién lo guarda en disco).
const COMPONENTS = Object.freeze(['electron', 'api', 'frontend'])
// Procesos que escriben archivos: cada uno tiene su propio directorio.
const WRITERS = Object.freeze(['electron', 'api'])

const EVENT_NAME = /^[a-z][a-z0-9_]{0,30}\.[a-z][a-z0-9_]{0,50}$/

// evento -> categoría por defecto y descripción (la severidad la decide el punto de emisión).
const EVENTS = Object.freeze({
  // execution
  'app.started': ['execution', 'Proceso iniciado (versión, runtime, pid).'],
  'app.ready': ['execution', 'Electron listo para crear ventanas.'],
  'app.stopping': ['execution', 'Inicio de cierre ordenado (before-quit o señal).'],
  'app.stopped': ['execution', 'Cierre limpio del proceso (con código de salida).'],
  'window.created': ['execution', 'Ventana de Electron creada.'],
  'window.closed': ['execution', 'Ventana de Electron cerrada.'],
  'api.listening': ['execution', 'API local escuchando conexiones.'],
  // error
  'error.uncaught_exception': ['error', 'Excepción no controlada.'],
  'error.unhandled_rejection': ['error', 'Promesa rechazada sin manejar.'],
  'api.listen_failed': ['error', 'La API local no pudo abrir su puerto.'],
  'api.request_failed': ['error', 'Una solicitud a la API local terminó en error.'],
  'ipc.handler_failed': ['error', 'Un manejador IPC lanzó una excepción.'],
  'window.load_failed': ['connection', 'La ventana no pudo cargar el frontend.'],
  'window.render_process_gone': ['error', 'El proceso de renderizado terminó de forma inesperada.'],
  'window.unresponsive': ['error', 'La ventana dejó de responder.'],
  'window.responsive': ['execution', 'La ventana volvió a responder.'],
  'child_process.gone': ['error', 'Un proceso hijo de Electron terminó de forma inesperada.'],
  'ui.error_unhandled': ['error', 'Error no controlado en la interfaz (renderer).'],
  // printing_technical (diagnóstico técnico; NO confirma papel impreso)
  'print.labels_submitted': ['printing_technical', 'La llamada de impresión de etiquetas terminó sin error técnico.'],
  'print.labels_failed': ['printing_technical', 'La impresión de etiquetas falló o fue cancelada.'],
  'print.letterhead_submitted': ['printing_technical', 'La llamada de impresión del membrete terminó sin error técnico.'],
  'print.letterhead_failed': ['printing_technical', 'La impresión del membrete falló o fue cancelada.'],
  'print.letterhead_ambiguous': ['printing_technical', 'Hay varios despachos candidatos; no se imprimió.'],
  'prisma.supervised_claimed': ['printing_technical', 'La estación reclamó un trabajo supervisado.'],
  'prisma.supervised_outcome': ['printing_technical', 'Resultado técnico informado a Laravel para un trabajo supervisado.'],
  'prisma.supervised_failed': ['printing_technical', 'Falló la ejecución técnica de un trabajo supervisado.'],
  'prisma.complete_failed': ['connection', 'No se pudo informar el resultado de un trabajo a Laravel.'],
  // connection
  'backend.request_failed': ['connection', 'Solicitud saliente al backend fallida (muestreada).'],
  'backend.request_recovered': ['connection', 'El backend volvió a responder tras fallos.'],
  'socket.connected': ['connection', 'Socket de avisos conectado.'],
  'socket.disconnected': ['connection', 'Socket de avisos desconectado.'],
  'socket.connect_failed': ['connection', 'Fallo de conexión del socket (muestreado).'],
  'socket.join_rejected': ['connection', 'El Event Hub rechazó unir la estación a su sala.'],
  // polling
  'polling.started': ['polling', 'La estación empezó a consultar a Laravel.'],
  'polling.stopped': ['polling', 'La consulta periódica se detuvo (ventana cerrada o navegó).'],
  'polling.failed': ['polling', 'Fallos consecutivos de polling (muestreado en potencias de 2).'],
  'polling.recovered': ['polling', 'El polling se recuperó tras fallos.'],
  // configuration
  'config.loaded': ['configuration', 'Configuración operativa resuelta al arrancar.'],
  'config.changed': ['configuration', 'Cambio de configuración local (sin valores).'],
  'config.change_rejected': ['configuration', 'Un cambio de configuración fue rechazado.'],
  'config.station_id_unwritable': ['configuration', 'No se pudo persistir el identificador de la estación.'],
  // security
  'security.origin_rejected': ['security', 'Se rechazó una llamada IPC desde un origen no autorizado.'],
  'security.auth_rejected': ['security', 'El backend rechazó la sesión (401/403).'],
  'security.input_rejected': ['security', 'Una entrada no válida fue rechazada.'],
  // system
  'system.signal_received': ['system', 'Señal del sistema operativo recibida.'],
  'log.events_dropped': ['system', 'Se descartaron eventos por backpressure o fallo de escritura.'],
  'log.write_failed': ['system', 'Fallo al escribir el archivo de logs (aviso local).'],
  'log.retention_applied': ['system', 'Se aplicó retención y se borraron archivos antiguos.'],
  'log.read_failed': ['system', 'Fallo al leer registros para la interfaz.'],
  'log.exported': ['system', 'Se exportaron registros saneados.'],
  'log.invalid_event': ['system', 'Se recibió un nombre de evento fuera del formato.'],
})

function defaultCategory(event) {
  return EVENTS[event]?.[0] || 'execution'
}

module.exports = { LEVELS, LEVEL_RANK, CATEGORIES, COMPONENTS, WRITERS, EVENT_NAME, EVENTS, defaultCategory }
