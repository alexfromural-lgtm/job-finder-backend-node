#!/bin/sh

# Run Prisma commands first
echo "🔧 Generating Prisma client..."
npx prisma generate

echo "🗃 Running Prisma migrations..."
npx prisma migrate deploy

# Start the server based on environment
if [ "$NODE_ENV" = "production" ]; then
  echo "🚀 Starting the production server..."
  npm start
else
  echo "🚀 Starting the dev server..."
  npm run dev
fi