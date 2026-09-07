import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import {
  FastifyPluginAsync,
  FastifyServerOptions,
} from 'fastify'
import AutoLoad, { AutoloadPluginOptions } from '@fastify/autoload'
import { ErrorCode } from '@tenda/shared'
import type { ApiError } from '@tenda/shared'
import { registerErrorHandlers } from './lib/http-errors'



export interface AppOptions extends FastifyServerOptions, Partial<AutoloadPluginOptions> {}

// Single source for the Android identity, assetlinks verification and the
// Play Store fallback link must always agree on the package name.
export const ANDROID_PACKAGE_NAME = 'com.tendahq.mobile'
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_NAME}`

const options: AppOptions = {}

const app: FastifyPluginAsync<AppOptions> = async (
  fastify,
  opts
): Promise<void> => {
  // Error envelope shared with the test harness (lib/http-errors.ts).
  registerErrorHandlers(fastify)

  // Load all plugins (db, auth, cors, rate-limit, sensible)
  void fastify.register(AutoLoad, {
    dir: join(__dirname, 'plugins'),
    options: opts,
  })

  // Load all routes (v1/ folder structure handles prefixing).
  // routeParams: true converts _id directory names to :id URL parameters.
  void fastify.register(AutoLoad, {
    dir: join(__dirname, 'routes'),
    options: opts,
    routeParams: true,
  })

  fastify.get('/', async (_request, reply) => {
    reply.send({ status: 'ok' })
  })

  // Android App Links verification file
  fastify.get('/.well-known/assetlinks.json', async (_request, reply) => {
    reply.type('application/json').send([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: ANDROID_PACKAGE_NAME,
          sha256_cert_fingerprints: [process.env.ANDROID_SHA256_FINGERPRINT ?? ''],
        },
      },
    ])
  })

  // Web fallback for shared gig links, redirects to app or Play Store
  fastify.get<{ Params: { id: string } }>('/gig/:id', async (request, reply) => {
    const { id } = request.params
    const deepLink = `tenda://gig/${id}`
    const storeUrl = PLAY_STORE_URL
    reply.type('text/html').send(`<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Tenda, View Gig</title>
        <style>
          body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center;
                justify-content: center; min-height: 100vh; margin: 0; background: #fafaf8; color: #3d4d63; }
          a { color: #3b70c4; font-weight: 600; }
        </style>
      </head>
      <body>
        <p>Opening in Tenda…</p>
        <p>Don't have the app? <a href="${storeUrl}">Get it on Google Play</a></p>
        <script>
          window.location.replace('${deepLink}');
          setTimeout(function () { window.location.replace('${storeUrl}'); }, 2500);
        </script>
      </body>
      </html>`
    )
  })

  fastify.get('/favicon.ico', async (request, reply) => {
    try {
      const filePath = join(__dirname, 'assets', 'favicon.png')
      const buffer = await readFile(filePath)
      reply.type('image/png').send(buffer)
    } catch {
      const error: ApiError = {
        statusCode: 404,
        error: 'Not Found',
        message: 'favicon.png not found',
        code: ErrorCode.INTERNAL_ERROR,
      }
      reply.code(404).send(error)
    }
  })
}


export default app
export { app, options }
