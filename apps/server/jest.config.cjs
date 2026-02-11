/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@workflow/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@workflow/shared/(.*)$': '<rootDir>/../../packages/shared/src/$1',
  },
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  collectCoverageFrom: ['<rootDir>/src/**/*.ts'],
};
