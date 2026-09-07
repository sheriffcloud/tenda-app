import '../instrument.js'
import 'dotenv/config'
import Fastify from 'fastify'
import {app, options} from './app'
import { loadConfig } from './config'
import { migrateOnBoot } from './lib/boot-migrate'
import { seedOnBoot } from './lib/boot-seed'
import * as Sentry from "@sentry/node";

const isDev = process.env.NODE_ENV !== 'production'
const server = Fastify({
    // Trust the X-Forwarded-For header set by reverse proxies (Nginx, cloud LBs).
    // Required so rate limiting and logging use the real client IP, not the proxy IP.
    trustProxy: true,
    logger: isDev
      ? { level: 'debug', transport: { target: 'pino-pretty' } }
      : { level: 'info' },
})

const startServer = async () => {
  try {
    loadConfig();

    // Opt-in boot-time migration, no-op unless MIGRATE_ON_BOOT=true.
    await migrateOnBoot(server.log)

    // Opt-in boot-time registry seed, no-op unless SEED_ON_BOOT=true. Must run
    // AFTER migrations (it writes tables they create) and BEFORE the app is
    // registered, because the chains plugin's assertChainRegistryInSync is the
    // check this exists to satisfy.
    await seedOnBoot(server.log)

    // Register Sentry error handler before app routes so it captures all errors
    Sentry.setupFastifyErrorHandler(server)

    // Register your app
    await server.register(app, options)

    // Start listening
    await server.listen({
      port: Number(process.env.PORT ?? 3000),
      host: '0.0.0.0'
    })

    const address = server.server.address()
    const port = typeof address === 'string' ? address : address?.port
    server.log.info(`Server listening on port ${port}`)
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

// Handle graceful shutdown, let in-flight requests finish before the process exits.
// Required for clean container restarts in Docker / k8s.
const gracefulShutdown = async (signal: string) => {
  server.log.info(`Received ${signal}, closing server...`)
  await server.close()
  process.exit(0)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT',  () => gracefulShutdown('SIGINT'))

startServer()