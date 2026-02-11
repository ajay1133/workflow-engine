/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  collectCoverageFrom: ['<rootDir>/src/**/*.ts'],
};
