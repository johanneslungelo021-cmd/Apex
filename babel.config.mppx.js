/**
 * Babel config used ONLY for node_modules/mppx and its ESM dependencies.
 * Compiles pure-ESM packages to CommonJS so Jest can require() them.
 * Our own TypeScript code uses the Next.js SWC transformer instead.
 */
module.exports = {
  plugins: ['@babel/plugin-transform-modules-commonjs'],
};
