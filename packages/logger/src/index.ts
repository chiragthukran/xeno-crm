import pino from 'pino'

const isDev = process.env.NODE_ENV !== 'production'

export const createLogger = (service: string) =>
  pino({
    name: service,
    level: process.env.LOG_LEVEL ?? 'info',
    transport: isDev
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
    formatters: {
      level: (label) => ({ level: label }),
    },
    base: { service },
  })

export const addCorrelationId = (
  logger: pino.Logger,
  correlationId: string,
) => logger.child({ correlationId })

export type Logger = pino.Logger
