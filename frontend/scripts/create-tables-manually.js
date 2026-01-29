// Manual script to create tables using raw SQL
// This bypasses Prisma version issues

import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS "EkmanImage" (
    "id" TEXT NOT NULL,
    "imageData" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EkmanImage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EkmanImage_label_idx" ON "EkmanImage"("label");
CREATE INDEX IF NOT EXISTS "EkmanImage_difficulty_idx" ON "EkmanImage"("difficulty");
CREATE INDEX IF NOT EXISTS "EkmanImage_label_difficulty_idx" ON "EkmanImage"("label", "difficulty");

CREATE TABLE IF NOT EXISTS "TransitionVideo" (
    "id" TEXT NOT NULL,
    "videoData" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TransitionVideo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TransitionVideo_from_idx" ON "TransitionVideo"("from");
CREATE INDEX IF NOT EXISTS "TransitionVideo_to_idx" ON "TransitionVideo"("to");
CREATE INDEX IF NOT EXISTS "TransitionVideo_from_to_idx" ON "TransitionVideo"("from", "to");
`;

async function main() {
  try {
    await client.connect();
    console.log('✅ Connected to database');
    
    console.log('📝 Creating tables...');
    await client.query(CREATE_TABLES_SQL);
    console.log('✅ Tables created successfully');
    
    // Verify tables exist
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('EkmanImage', 'TransitionVideo')
    `);
    
    console.log(`✅ Found ${result.rows.length} tables:`, result.rows.map(r => r.table_name));
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();


