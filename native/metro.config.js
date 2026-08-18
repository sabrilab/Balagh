/**
 * Le noyau partagé vit hors du dossier de l'application (../core) : Metro doit
 * le surveiller explicitement, et savoir résoudre l'extension .mjs.
 */
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [path.resolve(repoRoot, 'core'), path.resolve(repoRoot, 'data')];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];
if (!config.resolver.sourceExts.includes('mjs')) config.resolver.sourceExts.push('mjs');

module.exports = config;
