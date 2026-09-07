// Sentry bootstrap — must load before every other module (server.ts imports
// this file first). dotenv loads here too, BEFORE server.ts's own
// `import 'dotenv/config'`, so SENTRY_DSN can live in .env like every other
// secret rather than being hardcoded into a source file.
require("dotenv/config");
const Sentry = require("@sentry/node");

// No DSN = Sentry disabled (dev, forks, CI). Sentry.setupFastifyErrorHandler
// stays safe to call either way — capture is a no-op without a client.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    // Adds request headers and IP for users, for more info visit:
    // https://docs.sentry.io/platforms/javascript/guides/node/configuration/options/#sendDefaultPii
    sendDefaultPii: true,
  });
}
