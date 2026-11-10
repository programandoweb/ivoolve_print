// Logger técnico de la API. El núcleo es JavaScript compartido con Electron
// (apps/shared/logging) y se carga con require relativo: el mismo nivel de carpetas
// desde src/logging (ts-node-dev) y dist/logging (compilado), sin tocar rootDir ni dependencias.
// eslint-disable-next-line @typescript-eslint/no-var-requires
export const shared: any = require('../../../shared/logging')

// Raíz coherente con Electron: IVOOLVE_PRINT_LOG_DIR o %APPDATA%\desktop\logs (ver docs/logging).
export const apiLogger = shared.createLogger({
  root: shared.resolveRoot(),
  component: 'api',
  processName: 'main',
})

export const correlationStore = shared.correlation
export const CORRELATION_ID: RegExp = shared.CORRELATION_ID
