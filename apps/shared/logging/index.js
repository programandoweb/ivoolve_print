'use strict'
// Núcleo de logging técnico de ivoolve_print, compartido por Electron (main) y la API NestJS.
// JavaScript puro (CommonJS) y sin dependencias: se carga con require relativo desde ambos.
const catalog = require('./catalog')
const sanitize = require('./sanitize')
const logger = require('./logger')
const reader = require('./reader')
const writer = require('./writer')

module.exports = {
  ...catalog,
  ...logger,
  sanitize,
  queryLogs: reader.queryLogs,
  normalizeQuery: reader.normalizeQuery,
  serialize: reader.serialize,
  infoLogs: reader.infoLogs,
  LIMITS: reader.LIMITS,
  LogWriter: writer.LogWriter,
  enforceRetention: writer.enforceRetention,
}
