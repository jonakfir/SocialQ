// frontend/migrate-prisma-to-postgres.js
// Migrates all Prisma data from SQLite to PostgreSQL
require('dotenv').config();
const Database = require('better-sqlite3');
const { Pool } = require('pg');
const path = require('path');

// SQLite connection (old database)
const SQLITE_DB_PATH = path.join(__dirname, 'prisma', 'dev.db');
let sqliteDb = null;
try {
  sqliteDb = new Database(SQLITE_DB_PATH, { readonly: true });
  console.log('✅ Connected to SQLite database');
} catch (error) {
  console.log('⚠️  SQLite database not found (this is OK if starting fresh):', SQLITE_DB_PATH);
}

// PostgreSQL connection (new database)
const POSTGRES_URL = process.env.DATABASE_URL;

if (!POSTGRES_URL) {
  console.error('Error: DATABASE_URL environment variable is not set for PostgreSQL.');
  process.exit(1);
}

const pgPool = new Pool({
  connectionString: POSTGRES_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function migrateData() {
  console.log('🚀 Starting migration from Prisma SQLite to PostgreSQL...\n');

  try {
    // Test PostgreSQL connection
    await pgPool.query('SELECT NOW()');
    console.log('✅ Connected to PostgreSQL\n');

    if (!sqliteDb) {
      console.log('\n⚠️  No SQLite database found. Skipping data migration.');
      console.log('   This is OK if you\'re starting fresh - Prisma will create tables on first run.\n');
      return;
    }

    // Migrate Users
    console.log('📦 Migrating Users...');
    const sqliteUsers = sqliteDb.prepare('SELECT * FROM User').all();
    console.log(`   Found ${sqliteUsers.length} users in SQLite`);
    
    for (const user of sqliteUsers) {
      try {
        // Check if user already exists
        const existing = await pgPool.query(
          'SELECT id FROM "User" WHERE id = $1 OR username = $2',
          [user.id, user.username]
        );
        
        if (existing.rows.length === 0) {
          await pgPool.query(
            `INSERT INTO "User" (id, username, password, role, "invitationCode", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (id) DO NOTHING`,
            [
              user.id,
              user.username,
              user.password,
              user.role || 'personal',
              user.invitationCode,
              user.createdAt,
              user.updatedAt
            ]
          );
          console.log(`   ✅ Migrated user: ${user.username}`);
        } else {
          console.log(`   ⏭️  Skipped user (already exists): ${user.username}`);
        }
      } catch (error) {
        console.error(`   ❌ Error migrating user ${user.username}:`, error.message);
      }
    }

    // Migrate Organizations
    console.log('\n📦 Migrating Organizations...');
    try {
      const sqliteOrgs = sqliteDb.prepare('SELECT * FROM Organization').all();
      console.log(`   Found ${sqliteOrgs.length} organizations in SQLite`);
      
      for (const org of sqliteOrgs) {
        try {
          const existing = await pgPool.query('SELECT id FROM "Organization" WHERE id = $1', [org.id]);
          if (existing.rows.length === 0) {
            await pgPool.query(
              `INSERT INTO "Organization" (id, name, description, status, "createdByUserId", "createdAt")
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (id) DO NOTHING`,
              [org.id, org.name, org.description, org.status, org.createdByUserId, org.createdAt]
            );
            console.log(`   ✅ Migrated organization: ${org.name}`);
          }
        } catch (error) {
          console.error(`   ❌ Error migrating organization ${org.name}:`, error.message);
        }
      }
    } catch (error) {
      console.log('   ⚠️  No organizations table in SQLite (OK)');
    }

    // Migrate Organization Memberships
    console.log('\n📦 Migrating Organization Memberships...');
    try {
      const sqliteMemberships = sqliteDb.prepare('SELECT * FROM OrganizationMembership').all();
      console.log(`   Found ${sqliteMemberships.length} memberships in SQLite`);
      
      for (const membership of sqliteMemberships) {
        try {
          const existing = await pgPool.query('SELECT id FROM "OrganizationMembership" WHERE id = $1', [membership.id]);
          if (existing.rows.length === 0) {
            await pgPool.query(
              `INSERT INTO "OrganizationMembership" (id, "organizationId", "userId", role, status, "joinedAt")
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (id) DO NOTHING`,
              [membership.id, membership.organizationId, membership.userId, membership.role, membership.status, membership.joinedAt]
            );
          }
        } catch (error) {
          console.error(`   ❌ Error migrating membership ${membership.id}:`, error.message);
        }
      }
    } catch (error) {
      console.log('   ⚠️  No OrganizationMembership table in SQLite (OK)');
    }

    // Migrate Game Sessions
    console.log('\n📦 Migrating Game Sessions...');
    try {
      const sqliteSessions = sqliteDb.prepare('SELECT * FROM GameSession').all();
      console.log(`   Found ${sqliteSessions.length} game sessions in SQLite`);
      
      for (const session of sqliteSessions) {
        try {
          const existing = await pgPool.query('SELECT id FROM "GameSession" WHERE id = $1', [session.id]);
          if (existing.rows.length === 0) {
            await pgPool.query(
              `INSERT INTO "GameSession" (id, "userId", "gameType", difficulty, level, score, total, "timeMs", "createdAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
               ON CONFLICT (id) DO NOTHING`,
              [session.id, session.userId, session.gameType, session.difficulty, session.level, session.score, session.total, session.timeMs, session.createdAt]
            );
          }
        } catch (error) {
          console.error(`   ❌ Error migrating session ${session.id}:`, error.message);
        }
      }
      console.log(`   ✅ Migrated ${sqliteSessions.length} game sessions`);
    } catch (error) {
      console.log('   ⚠️  No GameSession table in SQLite (OK)');
    }

    // Migrate Game Questions
    console.log('\n📦 Migrating Game Questions...');
    try {
      const sqliteQuestions = sqliteDb.prepare('SELECT * FROM GameQuestion').all();
      console.log(`   Found ${sqliteQuestions.length} game questions in SQLite`);
      
      for (const question of sqliteQuestions) {
        try {
          const existing = await pgPool.query('SELECT id FROM "GameQuestion" WHERE id = $1', [question.id]);
          if (existing.rows.length === 0) {
            await pgPool.query(
              `INSERT INTO "GameQuestion" (id, "sessionId", "questionIndex", correct, picked, "isCorrect", "createdAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               ON CONFLICT (id) DO NOTHING`,
              [question.id, question.sessionId, question.questionIndex, question.correct, question.picked, question.isCorrect, question.createdAt]
            );
          }
        } catch (error) {
          console.error(`   ❌ Error migrating question ${question.id}:`, error.message);
        }
      }
      console.log(`   ✅ Migrated ${sqliteQuestions.length} game questions`);
    } catch (error) {
      console.log('   ⚠️  No GameQuestion table in SQLite (OK)');
    }

    // Migrate Collages
    console.log('\n📦 Migrating Collages...');
    try {
      const sqliteCollages = sqliteDb.prepare('SELECT * FROM Collage').all();
      console.log(`   Found ${sqliteCollages.length} collages in SQLite`);
      
      for (const collage of sqliteCollages) {
        try {
          const existing = await pgPool.query('SELECT id FROM "Collage" WHERE id = $1', [collage.id]);
          if (existing.rows.length === 0) {
            await pgPool.query(
              `INSERT INTO "Collage" (id, "userId", "imageUrl", emotions, folder, "createdAt")
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (id) DO NOTHING`,
              [collage.id, collage.userId, collage.imageUrl, collage.emotions, collage.folder, collage.createdAt]
            );
          }
        } catch (error) {
          console.error(`   ❌ Error migrating collage ${collage.id}:`, error.message);
        }
      }
      console.log(`   ✅ Migrated ${sqliteCollages.length} collages`);
    } catch (error) {
      console.log('   ⚠️  No Collage table in SQLite (OK)');
    }

    // Migrate Friend Requests
    console.log('\n📦 Migrating Friend Requests...');
    try {
      const sqliteRequests = sqliteDb.prepare('SELECT * FROM FriendRequest').all();
      console.log(`   Found ${sqliteRequests.length} friend requests in SQLite`);
      
      for (const request of sqliteRequests) {
        try {
          const existing = await pgPool.query('SELECT id FROM "FriendRequest" WHERE id = $1', [request.id]);
          if (existing.rows.length === 0) {
            await pgPool.query(
              `INSERT INTO "FriendRequest" (id, "fromUserId", "toUserId", status, "createdAt", "updatedAt")
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (id) DO NOTHING`,
              [request.id, request.fromUserId, request.toUserId, request.status, request.createdAt, request.updatedAt]
            );
          }
        } catch (error) {
          console.error(`   ❌ Error migrating friend request ${request.id}:`, error.message);
        }
      }
      console.log(`   ✅ Migrated ${sqliteRequests.length} friend requests`);
    } catch (error) {
      console.log('   ⚠️  No FriendRequest table in SQLite (OK)');
    }

    // Migrate Friendships
    console.log('\n📦 Migrating Friendships...');
    try {
      const sqliteFriendships = sqliteDb.prepare('SELECT * FROM Friendship').all();
      console.log(`   Found ${sqliteFriendships.length} friendships in SQLite`);
      
      for (const friendship of sqliteFriendships) {
        try {
          const existing = await pgPool.query('SELECT id FROM "Friendship" WHERE id = $1', [friendship.id]);
          if (existing.rows.length === 0) {
            await pgPool.query(
              `INSERT INTO "Friendship" (id, "userId1", "userId2", "createdAt")
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (id) DO NOTHING`,
              [friendship.id, friendship.userId1, friendship.userId2, friendship.createdAt]
            );
          }
        } catch (error) {
          console.error(`   ❌ Error migrating friendship ${friendship.id}:`, error.message);
        }
      }
      console.log(`   ✅ Migrated ${sqliteFriendships.length} friendships`);
    } catch (error) {
      console.log('   ⚠️  No Friendship table in SQLite (OK)');
    }

    console.log('\n✨ Migration complete!');
    
    // Get final counts
    const userCount = await pgPool.query('SELECT COUNT(*) FROM "User"');
    const orgCount = await pgPool.query('SELECT COUNT(*) FROM "Organization"');
    const sessionCount = await pgPool.query('SELECT COUNT(*) FROM "GameSession"');
    
    console.log('\n📊 Final PostgreSQL counts:');
    console.log(`   Users: ${userCount.rows[0].count}`);
    console.log(`   Organizations: ${orgCount.rows[0].count}`);
    console.log(`   Game Sessions: ${sessionCount.rows[0].count}`);

  } catch (error) {
    console.error('\n❌ Migration error:', error);
    throw error;
  } finally {
    if (sqliteDb) sqliteDb.close();
    await pgPool.end();
  }
}

migrateData().catch(console.error);

