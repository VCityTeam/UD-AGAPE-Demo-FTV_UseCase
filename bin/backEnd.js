/**
 * @file Sets up an Express backend server for examples, serving static files,
 * replacing HTML strings, and enabling a game socket service.
 * The behavior adapts based on the environment mode (NODE_ENV) inject in process.env with cross-env package.
 * See {@link https://nodejs.org/api/process.html#processenv-env}, {@link https://www.npmjs.com/package/cross-env}
 *
 * requires {@link https://www.npmjs.com/package/@ud-viz/game_node}
 * requires {@link https://www.npmjs.com/package/@ud-viz/utils_shared}
 * requires {@link https://www.npmjs.com/package/string-replace-middleware}
 */

const udvizVersion = require('../package.json').version;

const path = require('path');
const reload = require('reload');
const { DEFAULT_PORT } = require('./constant');

const { stringReplace } = require('string-replace-middleware');
const express = require('express');

/**
 * The environment mode.
 *
 * @type {string}
 */
const NODE_ENV = process.env.NODE_ENV || 'debug';

console.log('Back-end starting in', NODE_ENV, 'mode');

/**
 * Express application instance.
 *
 * @type {object}
 */
const app = new express();

console.log(NODE_ENV)

// Apply string replacements for different values in HTML responses
app.use(
  stringReplace(
    {
      RUN_MODE: NODE_ENV,
    },
    {
      contentTypeFilterRegexp: /text\/html/,
    }
  )
);

app.use(
  stringReplace(
    {
      SCRIPT_TAG_RELOAD:
        NODE_ENV == 'development'
          ? '<script src="/reload/reload.js"></script>'
          : '',
    },
    {
      contentTypeFilterRegexp: /text\/html/,
    }
  )
);

app.use(
  stringReplace(
    {
      UDVIZ_VERSION: udvizVersion,
    },
    {
      contentTypeFilterRegexp: /text\/html/,
    }
  )
);

// Serve static files
app.use(express.static(path.resolve(__dirname, '../')));

/**
 * @type {number}
 */
const PORT = process.env.PORT || DEFAULT_PORT;
/**
 * The HTTP server instance.
 *
 * @type {object}
 */
const httpServer = app.listen(PORT, (err) => {
  if (err) {
    console.error('Server could not start');
    return;
  }
  console.log('Http server listening on port', PORT);
});