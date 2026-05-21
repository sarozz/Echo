// Entry shim so Expo can resolve `./plugin` as a config plugin.
// Run through ts-node at config-evaluation time via the Expo loader.
module.exports = require('./index').default;
