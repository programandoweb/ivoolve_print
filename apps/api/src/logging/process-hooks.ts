import { apiLogger } from './logger'

let installed = false

// Observa fallos y cierres del proceso SIN cambiar su comportamiento por defecto:
// 'uncaughtExceptionMonitor' no suprime el crash y las señales restauran la terminación original.
export function installProcessHooks() {
  if (installed) return
  installed = true
  let stopped = false
  const markStopped = (metadata: Record<string, unknown>) => {
    if (stopped) return
    stopped = true
    apiLogger.info('app.stopped', 'API local detenida', { metadata })
    apiLogger.flushSync()
  }

  process.on('uncaughtExceptionMonitor', (error, origin) => {
    apiLogger.fatal(
      origin === 'unhandledRejection' ? 'error.unhandled_rejection' : 'error.uncaught_exception',
      'Excepción no controlada en la API local',
      { error, dedupe: true },
    )
    apiLogger.flushSync()
  })
  process.on('exit', (code) => markStopped({ exit_code: code }))

  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    const handler = () => {
      apiLogger.warn('system.signal_received', `Señal ${signal} recibida`, { metadata: { signal } })
      apiLogger.info('app.stopping', 'Cierre de la API local solicitado', { metadata: { signal } })
      // En Windows process.kill termina sin emitir 'exit': se deja la marca de cierre aquí.
      markStopped({ signal })
      process.removeListener(signal, handler)
      process.kill(process.pid, signal)
    }
    process.on(signal, handler)
  }
}
