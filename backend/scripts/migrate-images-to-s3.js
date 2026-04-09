/**
 * migrate-images-to-s3.js
 *
 * One-time migration: reads all EkmanImage rows that have base64 imageData
 * but no imageUrl, uploads the image to S3, then sets imageUrl in the DB.
 *
 * Usage:
 *   AWS_REGION=us-east-2 S3_BUCKET=socialq-quiz-images \
 *   DATABASE_URL=postgresql://... node scripts/migrate-images-to-s3.js
 */

const { Client } = require('pg');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const BUCKET = process.env.S3_BUCKET || 'socialq-quiz-images';
const REGION = process.env.AWS_REGION || 'us-east-2';
const CF_DOMAIN = process.env.CF_DOMAIN || 'd2y5cy3yevf165.cloudfront.net';
const DB_URL = process.env.DATABASE_URL || 'postgresql://postgres:Jonathankfir7861@socialq-db.cneeyqqambvb.us-east-2.rds.amazonaws.com:5432/postgres';

const s3 = new S3Client({ region: REGION });

async function run() {
  const db = new Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false }
  });
  await db.connect();
  console.log('Connected to DB');

  // Fetch all rows without imageUrl
  const { rows } = await db.query(
    `SELECT id, "imageData", label, "photoType", difficulty FROM "EkmanImage" WHERE "imageUrl" IS NULL`
  );
  console.log(`Found ${rows.length} images to migrate`);

  let migrated = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const dataUrl = row.imageData || '';
      // Parse data URL: data:<mime>;base64,<data>
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
      if (!match) {
        console.warn(`  [SKIP] ${row.id}: not a base64 data URL`);
        continue;
      }
      const mimeType = match[1];
      const base64Data = match[2];
      const buffer = Buffer.from(base64Data, 'base64');
      const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
      const key = `ekman/${row.photoType}/${row.label}/${row.id}.${ext}`;

      // Upload to S3
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        CacheControl: 'public, max-age=31536000, immutable'
      }));

      const imageUrl = `https://${CF_DOMAIN}/${key}`;

      // Update DB
      await db.query(
        `UPDATE "EkmanImage" SET "imageUrl" = $1 WHERE id = $2`,
        [imageUrl, row.id]
      );

      migrated++;
      if (migrated % 10 === 0) {
        console.log(`  Migrated ${migrated}/${rows.length}...`);
      }
    } catch (err) {
      console.error(`  [FAIL] ${row.id}:`, err.message);
      failed++;
    }
  }

  console.log(`\nDone. Migrated: ${migrated}, Failed: ${failed}, Skipped: ${rows.length - migrated - failed}`);
  await db.end();
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
