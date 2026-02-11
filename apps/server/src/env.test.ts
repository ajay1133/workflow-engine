import { loadEnv } from './env';

test('loadEnv throws on missing DATABASE_URL', () => {
  expect(() => loadEnv({ PORT: '3000', JWT_SECRET: '0123456789abcdef' })).toThrow(/DATABASE_URL/i);
});
