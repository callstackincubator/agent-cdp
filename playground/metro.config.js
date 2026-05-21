const { getDefaultConfig } = require('expo/metro-config');
const { withRozenite } = require('@rozenite/metro');

const config = getDefaultConfig(__dirname);

module.exports = withRozenite(config, {
  enabled: process.env.WITH_ROZENITE === 'true',
});