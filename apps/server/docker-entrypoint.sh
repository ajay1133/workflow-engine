set -e

# Apply migrations (requires DATABASE_URL)
./node_modules/.bin/prisma migrate deploy --schema ./apps/server/prisma/schema.prisma

# Start server (API + in-process worker)
node ./apps/server/dist/index.js
