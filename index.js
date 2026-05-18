'use strict';

const server = require('./dist/server');
const provider = server.default?.services?.provider || server.services?.provider;

module.exports = {
  init: provider,
};
