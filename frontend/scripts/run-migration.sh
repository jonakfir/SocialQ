#!/bin/bash
# Script to run the folder management migration
# Usage: ./run-migration.sh

set -e

echo "📦 Running folder management migration..."

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "⚠️  DATABASE_URL environment variable is not set"
    echo "Please set it or export it before running this script"
    exit 1
fi

# Run the SQL migration
echo "🔧 Applying database schema changes..."
psql "$DATABASE_URL" -f scripts/migrate-folder-management.sql

echo "✅ Migration completed successfully!"
echo ""
echo "Next steps:"
echo "1. Run: node scripts/update-ekman-folder-type.js"
echo "2. (Optional) Import synthetic images via API: POST /api/admin/import-synthetic-images"
