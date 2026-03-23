/**
 * Jest configuration for Apex — ESM-native mode
 *
 * mppx is pure ESM (type:"module"). To run it in Jest without mocking:
 *   - extensionsToTreatAsEsm: ['.ts'] — treat our TS files as ESM
 *   - transformIgnorePatterns: allow mppx + deps through the transformer
 *   - ts-jest with useESM:true — compiles TS to ESM for Jest's ESM runtime
 *   - NODE_OPTIONS=--experimental-vm-modules — enable Jest's ESM support
 *
 * Run: npm run test
 * With live Tempo RPC: TEMPO_RPC_ENABLED=true npm run test
 */
module.exports = {
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    // Path aliases
    '^@/(.*)$': '<rootDir>/src/$1',
    // server-only is a Next.js build-time guard; replace with a no-op in Jest
    '^server-only$': '<rootDir>/src/__mocks__/server-only.ts',
    // ESM-to-CJS shim for viem — it ships CJS but some sub-imports use .js extensions
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    // ts-jest in ESM mode — compiles TypeScript as ESM
    '^.+\\.tsx?$': ['ts-jest', {
      useESM:   true,
      tsconfig: 'tsconfig.json',
    }],
  },
  // Allow mppx and its ESM deps through WITHOUT transformation
  // In ESM mode, Jest's VM handles native import/export statements directly
  transformIgnorePatterns: [
    '/node_modules/(?!(mppx|incur|@remix-run/fetch-proxy|@remix-run/node-fetch-server)/)',
  ],
  testMatch:   ['<rootDir>/tests/**/*.test.ts'],
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/.next/'],
  testTimeout: 30000,
};
