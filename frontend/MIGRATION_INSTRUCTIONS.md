# Migration Instructions

## Apply Database Schema Changes

The schema has been updated to add:
1. `photoType` field to `EkmanImage` table (ekman | other)
2. `EkmanImageOrganizationVisibility` junction table for organization-specific visibility

### Option 1: Using Prisma Migrate (Recommended)

When your database is accessible, run:

```bash
cd web/frontend
npx prisma migrate dev --name add_ekman_organization_visibility
```

Or if you prefer to push directly:

```bash
npx prisma db push
```

### Option 2: Manual SQL Migration

If you prefer to run the SQL manually, execute the SQL file:

```bash
psql -h your-database-host -U your-username -d your-database -f prisma/migrations/add_ekman_organization_visibility.sql
```

Or copy and paste the SQL from `prisma/migrations/add_ekman_organization_visibility.sql` into your database client.

### What Changed

1. **EkmanImage table**: Added `photoType` column (default: 'ekman')
2. **New table**: `EkmanImageOrganizationVisibility` - links Ekman images to organizations
3. **Indexes**: Added indexes for performance on `photoType` and visibility relationships

### After Migration

Once the migration is complete, the new features will be available:
- Upload photos with emotion folders and organization visibility
- Filter photos by type (Ekman vs Other)
- Control which organizations see which photos in facial recognition
