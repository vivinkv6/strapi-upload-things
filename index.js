'use strict';

const providerModule = require('./server/src/services/provider');
const provider = providerModule.default || providerModule;

module.exports = {
  init: provider,
};
