// backend/db/db.js
const { Pool } = require('pg');

// -------------------------
// Database Connection
// -------------------------
// Use DATABASE_URL if available (Railway provides this), otherwise fall back to SQLite
const DATABASE_URL = process.env.DATABASE_URL;
const PGSSLMODE = String(process.env.PGSSLMODE || '').trim().toLowerCase(); // e.g. "require" | "disable"

let db = null;
let pool = null;
let usePostgres = false;

if (DATABASE_URL && DATABASE_URL.startsWith('postgresql://')) {
  // Use PostgreSQL - create pool immediately so schema init can use it
  usePostgres = true;
  
  // Create pool immediately (not deferred) so schema initialization can use it
  // Railway has two common connection modes:
  // - Internal: postgres.railway.internal:5432 (often requires SSL)
  // - Public TCP proxy: *.proxy.rlwy.net:<port> (often expects non-SSL; SSL can cause ECONNRESET)
  // We pick a sane default based on host/port, but allow override via PGSSLMODE.
  let parsed;
  try { parsed = new URL(DATABASE_URL); } catch { parsed = null; }
  const dbHost = parsed?.hostname || '';
  const dbPort = Number(parsed?.port || '5432');

  function sslForRailway() {
    // Explicit override via PGSSLMODE
    if (PGSSLMODE === 'disable') return false;
    if (PGSSLMODE === 'require') return { rejectUnauthorized: false };

    // Heuristics
    if (dbHost.includes('railway.internal')) return { rejectUnauthorized: false };
    // Public TCP proxy ports (not 5432) commonly terminate/RESET when client attempts SSL.
    if (dbPort && dbPort !== 5432) return false;
    if (dbHost.includes('proxy.rlwy.net') || dbHost.endsWith('rlwy.net')) return false;

    // Safe default
    return { rejectUnauthorized: false };
  }

  const ssl = sslForRailway();
  // Ensure SNI uses the original hostname (some TCP proxies require it).
  if (ssl && typeof ssl === 'object') {
    ssl.servername = ssl.servername || dbHost || undefined;
  }

  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl,
    // Add connection retry settings
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    allowExitOnIdle: true
  });
  
  console.log('[DB] Using PostgreSQL');
  console.log('[DB] DATABASE_URL:', DATABASE_URL.replace(/:[^:@]+@/, ':****@')); // Hide password
  console.log('[DB] PGSSLMODE:', PGSSLMODE || '(auto)');
  console.log('[DB] PostgreSQL host:', dbHost || '(unknown)', 'port:', dbPort || '(unknown)', 'ssl:', ssl ? 'enabled' : 'disabled', (ssl && typeof ssl === 'object' && ssl.servername ? `(SNI: ${ssl.servername})` : ''));
  
  // Test connection asynchronously (non-blocking)
  setImmediate(() => {
    pool.query('SELECT NOW()', (err) => {
      if (err) {
        console.error('[DB] PostgreSQL connection error:', err.message);
        console.error('[DB] Connection error details:', err);
      } else {
        console.log('[DB] PostgreSQL connected successfully');
      }
    });
  });
  
  // Handle pool errors
  pool.on('error', (err) => {
    console.error('[DB] Unexpected PostgreSQL pool error:', err);
  });
} else {
  // Fall back to SQLite for local development
  const fs = require('fs');
  const path = require('path');
  const Database = require('better-sqlite3');
  
  const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  
  const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, 'app.db');
  db = new Database(DB_PATH, { fileMustExist: false });
  
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 4000');
  
  console.log('[DB] Using SQLite (local development)');
}

// -------------------------
// Schema Setup
// -------------------------
async function initializeSchema(retries = 5) {
  if (usePostgres) {
    if (!pool) {
      throw new Error('[DB] ❌ PostgreSQL pool not initialized - DATABASE_URL may be missing');
    }
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`[DB] Starting schema initialization (attempt ${attempt}/${retries})...`);
        console.log(`[DB] DATABASE_URL present: ${!!process.env.DATABASE_URL}`);
        console.log(`[DB] DATABASE_URL host: ${process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).hostname : 'N/A'}`);
        
        // Ensure pool is ready - test connection first with quick retry (non-blocking)
        let connected = false;
        for (let connAttempt = 1; connAttempt <= 3; connAttempt++) {
          try {
            const result = await Promise.race([
              pool.query('SELECT NOW(), current_database(), current_schema()'),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 3000))
            ]);
            console.log('[DB] ✅ Database connection verified at', result.rows[0].now);
            console.log('[DB] Connected to database:', result.rows[0].current_database);
            console.log('[DB] Current schema:', result.rows[0].current_schema);
            connected = true;
            break;
          } catch (connErr) {
            console.error(`[DB] ❌ Database connection failed (attempt ${connAttempt}/3):`, connErr.message);
            if (connAttempt < 3) {
              const waitTime = 500 * connAttempt; // Reduced from 2000ms
              console.log(`[DB] Waiting ${waitTime}ms before retry...`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
            } else {
              // Don't throw - let it fail gracefully and retry later
              console.warn('[DB] ⚠️  Database connection failed, will retry on first request');
              return false;
            }
          }
        }
        
        if (!connected) {
          console.warn('[DB] ⚠️  Could not establish database connection, will retry on first request');
          return false;
        }
        
        // PostgreSQL schema - Users table
        await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id            SERIAL PRIMARY KEY,
          email         TEXT UNIQUE NOT NULL,
          password      TEXT NOT NULL,
          role          TEXT DEFAULT 'personal' CHECK (role IN ('admin', 'personal', 'org_admin')),
          access_level  TEXT DEFAULT 'none' CHECK (access_level IN ('pro', 'free_trial', 'none')),
          created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        `);
        console.log('[DB] Users table created/verified');
        
        // Add role column if it doesn't exist (migration)
        try {
          const roleCheck = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'role'
          `);
          
          if (roleCheck.rows.length === 0) {
            console.log('[DB] Adding role column to users table...');
            await pool.query(`
              ALTER TABLE users 
              ADD COLUMN role TEXT DEFAULT 'personal' CHECK (role IN ('admin', 'personal', 'org_admin'));
            `);
            // Set default role for existing users
            await pool.query(`UPDATE users SET role = 'personal' WHERE role IS NULL;`);
            console.log('[DB] Role column added successfully');
          }
        } catch (e) {
          console.error('[DB] Role column migration failed:', e);
        }
        
        // Add darkMode column if it doesn't exist (migration)
        try {
          const darkModeCheck = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'dark_mode'
          `);
          
          if (darkModeCheck.rows.length === 0) {
            console.log('[DB] Adding dark_mode column to users table...');
            await pool.query(`
              ALTER TABLE users 
              ADD COLUMN dark_mode BOOLEAN DEFAULT false;
            `);
            // Set default dark_mode for existing users
            await pool.query(`UPDATE users SET dark_mode = false WHERE dark_mode IS NULL;`);
            console.log('[DB] Dark mode column added successfully');
          }
        } catch (e) {
          console.error('[DB] Dark mode column migration failed:', e);
        }

        // Add access_level column if it doesn't exist (migration)
        try {
          const accessLevelCheck = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'access_level'
          `);
          if (accessLevelCheck.rows.length === 0) {
            console.log('[DB] Adding access_level column to users table...');
            await pool.query(`
              ALTER TABLE users 
              ADD COLUMN access_level TEXT DEFAULT 'none' CHECK (access_level IN ('pro', 'free_trial', 'none'));
            `);
            await pool.query(`UPDATE users SET access_level = 'none' WHERE access_level IS NULL;`);
            console.log('[DB] access_level column added successfully');
          }
        } catch (e) {
          console.error('[DB] access_level column migration failed:', e);
        }

        // Add stripe_customer_id and stripe_subscription_id if they don't exist (migration)
        for (const col of ['stripe_customer_id', 'stripe_subscription_id']) {
          try {
            const check = await pool.query(`
              SELECT column_name FROM information_schema.columns
              WHERE table_name = 'users' AND column_name = $1
            `, [col]);
            if (check.rows.length === 0) {
              await pool.query(`ALTER TABLE users ADD COLUMN ${col} TEXT;`);
              console.log('[DB] Added column:', col);
            }
          } catch (e) {
            console.error('[DB] Migration', col, 'failed:', e);
          }
        }

        // Add trial_ends_at for free trial expiry (migration)
        try {
          const check = await pool.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'users' AND column_name = 'trial_ends_at'
          `);
          if (check.rows.length === 0) {
            await pool.query(`ALTER TABLE users ADD COLUMN trial_ends_at TIMESTAMP;`);
            console.log('[DB] Added column: trial_ends_at');
          }
        } catch (e) {
          console.error('[DB] trial_ends_at migration failed:', e);
        }
      
        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        `);
        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
        `);
        console.log('[DB] User indexes created/verified');
        
        // Migration: username -> email (if needed)
        try {
          const result = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'username'
          `);
          
          if (result.rows.length > 0) {
            // Check if email column exists
            const emailCheck = await pool.query(`
              SELECT column_name 
              FROM information_schema.columns 
              WHERE table_name = 'users' AND column_name = 'email'
            `);
            
            if (emailCheck.rows.length === 0) {
              // Migrate username to email
              await pool.query(`ALTER TABLE users RENAME COLUMN username TO email;`);
            }
          }
        } catch (e) {
          console.error('[DB migration failed]', e);
        }
      
        // Organizations table
        await pool.query(`
          CREATE TABLE IF NOT EXISTS organizations (
            id              SERIAL PRIMARY KEY,
            name            TEXT UNIQUE NOT NULL,
            description     TEXT,
            status          TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
            created_by_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);
        console.log('[DB] Organizations table created/verified');
        
        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations(status);
        `);
        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_organizations_created_by ON organizations(created_by_user_id);
        `);
        
        // Organization memberships table
        await pool.query(`
        CREATE TABLE IF NOT EXISTS organization_memberships (
          id             SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
          user_id        INTEGER REFERENCES users(id) ON DELETE CASCADE,
          role           TEXT DEFAULT 'member' CHECK (role IN ('member', 'org_admin')),
          status         TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'removed')),
          joined_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(organization_id, user_id)
          );
        `);
        console.log('[DB] Organization memberships table created/verified');
        
        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_org_memberships_org_id ON organization_memberships(organization_id);
        `);
        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_org_memberships_user_id ON organization_memberships(user_id);
        `);
        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_org_memberships_status ON organization_memberships(status);
        `);
        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_org_memberships_role ON organization_memberships(role);
        `);
        
        // Friend requests table
        await pool.query(`
        CREATE TABLE IF NOT EXISTS friend_requests (
          id         SERIAL PRIMARY KEY,
          from_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          to_user_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
          status       TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
          created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(from_user_id, to_user_id)
          );
        `);
        console.log('[DB] Friend requests table created/verified');
        
        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_friend_requests_from ON friend_requests(from_user_id);
        `);
        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON friend_requests(to_user_id);
        `);
        
        // Friendships table
        await pool.query(`
        CREATE TABLE IF NOT EXISTS friendships (
          id         SERIAL PRIMARY KEY,
          user1_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
          user2_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user1_id, user2_id),
          CHECK (user1_id < user2_id)
          );
        `);
        console.log('[DB] Friendships table created/verified');
        
        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_friendships_user1 ON friendships(user1_id);
        `);
        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_friendships_user2 ON friendships(user2_id);
        `);

        // User profiles - stores onboarding data per user (age, verbal, literate, goals, etc.)
        await pool.query(`
        CREATE TABLE IF NOT EXISTS user_profiles (
          id                SERIAL PRIMARY KEY,
          user_id           INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
          user_type         TEXT NOT NULL CHECK (user_type IN ('myself', 'my_child', 'my_student', 'someone_else')),
          beneficiary_name  TEXT,
          is_over_18        BOOLEAN,
          birthday          DATE,
          is_verbal         BOOLEAN,
          is_literate       BOOLEAN,
          goal              TEXT CHECK (goal IN ('just_try', 'learn_emotions', 'join_pro')),
          teacher_email     TEXT,
          doctor_email      TEXT,
          doctor_name       TEXT,
          parent_name       TEXT,
          parent_email      TEXT,
          created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        `);
        console.log('[DB] User profiles table created/verified');

        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
        `);

        // EkmanImage table (for Recognition Quiz images)
        await pool.query(`
          CREATE TABLE IF NOT EXISTS "EkmanImage" (
            "id" TEXT NOT NULL,
            "imageData" TEXT NOT NULL,
            "label" TEXT NOT NULL,
            "difficulty" TEXT NOT NULL,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "EkmanImage_pkey" PRIMARY KEY ("id")
          );
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS "EkmanImage_label_idx" ON "EkmanImage"("label");`);
        await pool.query(`CREATE INDEX IF NOT EXISTS "EkmanImage_difficulty_idx" ON "EkmanImage"("difficulty");`);
        await pool.query(`CREATE INDEX IF NOT EXISTS "EkmanImage_label_difficulty_idx" ON "EkmanImage"("label", "difficulty");`);
        try {
          const pc = await pool.query(`
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'EkmanImage' AND column_name = 'photoType'
          `);
          if (pc.rows.length === 0) {
            await pool.query(`ALTER TABLE "EkmanImage" ADD COLUMN "photoType" TEXT DEFAULT 'ekman';`);
          }
        } catch (e) { /* ignore */ }
        try {
          const fc = await pool.query(`
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'EkmanImage' AND column_name = 'folder'
          `);
          if (fc.rows.length === 0) {
            await pool.query(`ALTER TABLE "EkmanImage" ADD COLUMN "folder" TEXT;`);
            console.log('[DB] EkmanImage.folder column added');
          }
        } catch (e) { /* ignore */ }
        console.log('[DB] EkmanImage table created/verified');

        // TransitionVideo table (for Transition Recognition clips)
        await pool.query(`
          CREATE TABLE IF NOT EXISTS "TransitionVideo" (
            "id" TEXT NOT NULL,
            "videoData" TEXT NOT NULL,
            "from" TEXT NOT NULL,
            "to" TEXT NOT NULL,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "TransitionVideo_pkey" PRIMARY KEY ("id")
          );
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS "TransitionVideo_from_idx" ON "TransitionVideo"("from");`);
        await pool.query(`CREATE INDEX IF NOT EXISTS "TransitionVideo_to_idx" ON "TransitionVideo"("to");`);
        await pool.query(`CREATE INDEX IF NOT EXISTS "TransitionVideo_from_to_idx" ON "TransitionVideo"("from", "to");`);
        console.log('[DB] TransitionVideo table created/verified');

        // Collage table (photo booth / Unverified Photos). No FK on userId so upload never fails (app may send id from different source).
        await pool.query(`
          CREATE TABLE IF NOT EXISTS "Collage" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "userId" INTEGER NOT NULL,
            "imageUrl" TEXT NOT NULL,
            "emotions" TEXT,
            "folder" TEXT DEFAULT 'Me',
            "approvedAnyway" BOOLEAN DEFAULT false,
            "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);
        await pool.query(`ALTER TABLE "Collage" DROP CONSTRAINT IF EXISTS "Collage_userId_fkey";`);
        await pool.query(`CREATE INDEX IF NOT EXISTS "Collage_userId_idx" ON "Collage"("userId");`);
        console.log('[DB] Collage table created/verified (no FK on userId)');
        
        console.log('[DB] ✅ Schema initialization complete');
        
        // Auto-create admin users if they don't exist
        try {
          const bcrypt = require('bcryptjs');
          const adminUsers = [
            { email: 'jonakfir@gmail.com', password: 'admin123' },
            { email: 'joseph.weatherbee@gmail.com', password: 'admin123' }
          ];
          
          for (const { email, password } of adminUsers) {
            const existingAdmin = await findUserByEmail(email);
            
            if (!existingAdmin) {
              console.log('[DB] Creating admin user:', email);
              const hashedPassword = await bcrypt.hash(password, 12);
              await createUser({ email, password: hashedPassword, role: 'admin' });
              console.log('[DB] ✅ Admin user created successfully:', email);
            } else {
              // Ensure existing admin user has admin role
              if (existingAdmin.role !== 'admin') {
                await updateUserRole(existingAdmin.id, 'admin');
                console.log('[DB] Updated user to admin:', email);
              } else {
                console.log('[DB] Admin user already exists with correct role:', email);
              }
            }
          }
        } catch (err) {
          console.error('[DB] Failed to create/update admin users:', err.message);
          // Don't throw - this is not critical
        }
        
        // Verify tables were actually created
        const verifyResult = await pool.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name IN ('users', 'organizations', 'organization_memberships', 'friend_requests', 'friendships')
          ORDER BY table_name;
        `);
        const createdTables = verifyResult.rows.map(r => r.table_name);
        console.log('[DB] Verified tables:', createdTables.join(', '));
        
        if (createdTables.length < 5) {
          const missing = ['users', 'organizations', 'organization_memberships', 'friend_requests', 'friendships']
            .filter(t => !createdTables.includes(t));
          throw new Error(`Missing tables: ${missing.join(', ')}`);
        }
        
        // If we get here, schema initialization succeeded
        console.log('[DB] ✅ Schema initialization completed and verified successfully');
        return;
      } catch (err) {
        console.error(`[DB] ❌ Schema initialization failed (attempt ${attempt}/${retries}):`, err.message);
        console.error('[DB] Error stack:', err.stack);
        if (attempt < retries) {
          const waitTime = 3000 * attempt; // 3s, 6s, 9s, 12s, 15s
          console.log(`[DB] Retrying in ${waitTime/1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        } else {
          console.error('[DB] ❌ Schema initialization failed after all retries');
          console.error('[DB] This is a CRITICAL error - server cannot start without database schema');
          throw err;
        }
      }
    }
    
    // Should never reach here, but just in case
    throw new Error('Schema initialization failed after all retries');
  } else {
    // SQLite schema (for local dev)
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        email      TEXT UNIQUE NOT NULL,
        password   TEXT NOT NULL,
        role       TEXT DEFAULT 'personal' CHECK (role IN ('admin', 'personal', 'org_admin')),
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
    `);
    
    // Add role column if it doesn't exist (migration)
    try {
      const cols = db.prepare(`PRAGMA table_info(users);`).all().map(c => c.name);
      if (!cols.includes('role')) {
        db.exec(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'personal';`);
        db.exec(`UPDATE users SET role = 'personal' WHERE role IS NULL;`);
      }
    } catch (e) {
      console.error('[DB role migration failed]', e);
    }
    
    // Add darkMode column if it doesn't exist (migration)
    try {
      const cols = db.prepare(`PRAGMA table_info(users);`).all().map(c => c.name);
      if (!cols.includes('dark_mode')) {
        db.exec(`ALTER TABLE users ADD COLUMN dark_mode INTEGER DEFAULT 0;`);
        db.exec(`UPDATE users SET dark_mode = 0 WHERE dark_mode IS NULL;`);
        console.log('[DB] Dark mode column added successfully');
      }
    } catch (e) {
      console.error('[DB dark mode migration failed]', e);
    }

    // Add access_level column if it doesn't exist (migration)
    try {
      const cols = db.prepare(`PRAGMA table_info(users);`).all().map(c => c.name);
      if (!cols.includes('access_level')) {
        db.exec(`ALTER TABLE users ADD COLUMN access_level TEXT DEFAULT 'none';`);
        db.exec(`UPDATE users SET access_level = 'none' WHERE access_level IS NULL;`);
        console.log('[DB] access_level column added successfully');
      }
    } catch (e) {
      console.error('[DB access_level migration failed]', e);
    }
    for (const col of ['stripe_customer_id', 'stripe_subscription_id']) {
      try {
        const cols = db.prepare(`PRAGMA table_info(users);`).all().map(c => c.name);
        if (!cols.includes(col)) {
          db.exec(`ALTER TABLE users ADD COLUMN ${col} TEXT;`);
          console.log('[DB] Added column:', col);
        }
      } catch (e) {
        console.error('[DB] Migration', col, 'failed:', e);
      }
    }
    try {
      const cols = db.prepare(`PRAGMA table_info(users);`).all().map(c => c.name);
      if (!cols.includes('trial_ends_at')) {
        db.exec(`ALTER TABLE users ADD COLUMN trial_ends_at TEXT;`);
        console.log('[DB] Added column: trial_ends_at');
      }
    } catch (e) {
      console.error('[DB] trial_ends_at migration failed:', e);
    }

    db.exec(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);`);
    
    // Migration: username -> email
    try {
      const cols = db.prepare(`PRAGMA table_info(users);`).all().map(c => c.name);
      if (cols.includes('username') && !cols.includes('email')) {
        try {
          db.exec(`ALTER TABLE users RENAME COLUMN username TO email;`);
        } catch {
          db.exec('BEGIN');
          db.exec(`
            CREATE TABLE users_new (
              id         INTEGER PRIMARY KEY AUTOINCREMENT,
              email      TEXT UNIQUE NOT NULL,
              password   TEXT NOT NULL,
              role       TEXT DEFAULT 'personal',
              created_at TEXT
            );
          `);
          db.exec(`
            INSERT INTO users_new (id, email, password, role, created_at)
            SELECT id, username, password, 'personal', created_at FROM users;
          `);
          db.exec(`DROP TABLE users;`);
          db.exec(`ALTER TABLE users_new RENAME TO users;`);
          db.exec('COMMIT');
        }
      }
    } catch (e) {
      console.error('[DB migration failed]', e);
    }
    
    // Organizations table
    db.exec(`
      CREATE TABLE IF NOT EXISTS organizations (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        name            TEXT UNIQUE NOT NULL,
        description     TEXT,
        status          TEXT DEFAULT 'pending',
        created_by_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at      TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
    `);
    
    db.exec(`CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations(status);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_organizations_created_by ON organizations(created_by_user_id);`);
    
    // Organization memberships table
    db.exec(`
      CREATE TABLE IF NOT EXISTS organization_memberships (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
        user_id        INTEGER REFERENCES users(id) ON DELETE CASCADE,
        role           TEXT DEFAULT 'member',
        status         TEXT DEFAULT 'pending',
        joined_at      TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        UNIQUE(organization_id, user_id)
      );
    `);
    
    db.exec(`CREATE INDEX IF NOT EXISTS idx_org_memberships_org_id ON organization_memberships(organization_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_org_memberships_user_id ON organization_memberships(user_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_org_memberships_status ON organization_memberships(status);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_org_memberships_role ON organization_memberships(role);`);
    
    // Friend requests table
    db.exec(`
      CREATE TABLE IF NOT EXISTS friend_requests (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        from_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        to_user_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
        status       TEXT DEFAULT 'pending',
        created_at   TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at   TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        UNIQUE(from_user_id, to_user_id)
      );
    `);
    
    db.exec(`CREATE INDEX IF NOT EXISTS idx_friend_requests_from ON friend_requests(from_user_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON friend_requests(to_user_id);`);
    
    // Friendships table
    db.exec(`
      CREATE TABLE IF NOT EXISTS friendships (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user1_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
        user2_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        UNIQUE(user1_id, user2_id),
        CHECK (user1_id < user2_id)
      );
    `);
    
    db.exec(`CREATE INDEX IF NOT EXISTS idx_friendships_user1 ON friendships(user1_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_friendships_user2 ON friendships(user2_id);`);

    // User profiles - stores onboarding data per user (age, verbal, literate, goals, etc.)
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id           INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        user_type         TEXT NOT NULL CHECK (user_type IN ('myself', 'my_child', 'my_student', 'someone_else')),
        beneficiary_name  TEXT,
        is_over_18        INTEGER,
        birthday          TEXT,
        is_verbal         INTEGER,
        is_literate       INTEGER,
        goal              TEXT CHECK (goal IN ('just_try', 'learn_emotions', 'join_pro')),
        teacher_email     TEXT,
        doctor_email      TEXT,
        doctor_name       TEXT,
        parent_name       TEXT,
        parent_email      TEXT,
        created_at        TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at        TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);`);
  }
}

// Initialize schema on load - but don't block (non-blocking)
// Export a promise so server can track it, but don't wait
// Use setTimeout(0) to defer execution and not block module loading
const schemaInitPromise = new Promise((resolve) => {
  // Defer to next tick to ensure module loads completely first
  setTimeout(() => {
    initializeSchema()
      .then(() => {
        console.log('[DB] ✅ Schema initialization completed successfully');
        resolve(true);
      })
      .catch(err => {
        console.error('[DB] ⚠️  Schema initialization error (non-fatal):', err.message);
        // Don't throw - let server start anyway
        resolve(false);
      });
  }, 0);
});

// -------------------------
// Helpers (email-centric)
// -------------------------
function toEmailKey(email) {
  return String(email || '').trim().toLowerCase();
}

async function createUser({ email, password, role, accessLevel }) {
  try {
    const e = toEmailKey(email);
    console.log('[createUser] Creating user with email:', e);
    
    // Ensure jonakfir@gmail.com is always admin
    let userRole = role || 'personal';
    if (e === 'jonakfir@gmail.com') {
      userRole = 'admin';
    }
    const level = accessLevel && ['pro', 'free_trial', 'none'].includes(accessLevel) ? accessLevel : 'none';
    
    if (usePostgres) {
      console.log('[createUser] Using PostgreSQL');
      // If table has username column (NOT NULL), set it to email so constraint is satisfied
      const hasUsername = (await pool.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'username' LIMIT 1`
      )).rows.length > 0;
      const insertQuery = hasUsername
        ? 'INSERT INTO users (email, password, role, access_level, username) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, role, access_level'
        : 'INSERT INTO users (email, password, role, access_level) VALUES ($1, $2, $3, $4) RETURNING id, email, role, access_level';
      const insertParams = hasUsername ? [e, password, userRole, level, e] : [e, password, userRole, level];
      const result = await pool.query(insertQuery, insertParams);
      const row = result.rows[0];
      console.log('[createUser] User created, ID:', row.id, 'Role:', row.role, 'AccessLevel:', row.access_level);
      return { id: Number(row.id), email: row.email, role: row.role, access_level: row.access_level };
    } else {
      console.log('[createUser] Using SQLite');
      const stmt = db.prepare('INSERT INTO users (email, password, role, access_level) VALUES (?, ?, ?, ?)');
      const info = stmt.run(e, password, userRole, level);
      console.log('[createUser] User created, ID:', info.lastInsertRowid, 'Role:', userRole, 'AccessLevel:', level);
      return { id: Number(info.lastInsertRowid), email: e, role: userRole, access_level: level };
    }
  } catch (err) {
    console.error('[createUser] Error:', err.message);
    console.error('[createUser] Error code:', err.code);
    console.error('[createUser] Error detail:', err.detail);
    throw err;
  }
}

async function findUserByEmail(email) {
  try {
    const e = toEmailKey(email);
    
    if (usePostgres) {
      const result = await pool.query(
        'SELECT id, email, password, role, dark_mode, access_level, trial_ends_at FROM users WHERE email = $1',
        [e]
      );
      const user = result.rows[0] || null;
      if (user) {
        user.dark_mode = user.dark_mode ?? false;
        // Ensure jonakfir@gmail.com always has admin role
        if (e === 'jonakfir@gmail.com' && user.role !== 'admin') {
          await updateUserRole(user.id, 'admin');
          user.role = 'admin';
        }
      }
      return user;
    } else {
      const user = db
        .prepare('SELECT id, email, password, role, dark_mode, access_level, trial_ends_at FROM users WHERE email = ?')
        .get(e) || null;
      if (user) {
        user.dark_mode = user.dark_mode ? Boolean(user.dark_mode) : false;
        // Ensure jonakfir@gmail.com always has admin role
        if (e === 'jonakfir@gmail.com' && user.role !== 'admin') {
          await updateUserRole(user.id, 'admin');
          user.role = 'admin';
        }
      }
      return user;
    }
  } catch (err) {
    console.error('[findUserByEmail] Error:', err.message);
    throw err;
  }
}

// Back-compat: treat "username" as email
const findUserByUsername = (email) => findUserByEmail(email);

async function searchUsersByEmail(emailPartial, excludeUserId, limit = 10) {
  const term = String(emailPartial || '').trim().toLowerCase();
  if (term.length < 2) return [];
  const likePattern = `%${term.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
  const exactEmail = term;
  try {
    if (usePostgres) {
      // Prefer exact email match first (full email lookup), then partial ILIKE
      const excludeSub = `
        u.id != $2
        AND u.id NOT IN (
          SELECT CASE WHEN f.user1_id = $2 THEN f.user2_id ELSE f.user1_id END
          FROM friendships f WHERE f.user1_id = $2 OR f.user2_id = $2
        )
        AND u.id NOT IN (
          SELECT to_user_id FROM friend_requests WHERE from_user_id = $2 AND status = 'pending'
        )
        AND u.id NOT IN (
          SELECT from_user_id FROM friend_requests WHERE to_user_id = $2 AND status = 'pending'
        )`;
      let result;
      // Exact match (same as toEmailKey normalization)
      result = await pool.query(
        `SELECT u.id, u.email as username FROM users u
         WHERE LOWER(TRIM(u.email)) = $1 AND ${excludeSub}
         LIMIT $3`,
        [exactEmail, excludeUserId, limit]
      );
      if (result.rows.length === 0) {
        result = await pool.query(
          `SELECT u.id, u.email as username FROM users u
           WHERE u.email ILIKE $1 AND ${excludeSub}
           ORDER BY u.email LIMIT $3`,
          [likePattern, excludeUserId, limit]
        );
      }
      return result.rows.map(r => ({ id: String(r.id), username: r.username || r.email || '' }));
    } else {
      let all = db.prepare(
        'SELECT id, email FROM users WHERE LOWER(TRIM(email)) = ? AND id != ? LIMIT ?'
      ).all(exactEmail, excludeUserId, limit);
      if (all.length === 0) {
        all = db.prepare(
          'SELECT id, email FROM users WHERE LOWER(email) LIKE ? AND id != ? LIMIT ?'
        ).all(likePattern, excludeUserId, limit * 2);
      }
      const friendships = db.prepare(
        'SELECT user1_id, user2_id FROM friendships WHERE user1_id = ? OR user2_id = ?'
      ).all(excludeUserId, excludeUserId);
      const excludeIds = new Set([excludeUserId]);
      friendships.forEach(f => {
        excludeIds.add(f.user1_id === excludeUserId ? f.user2_id : f.user1_id);
      });
      const sent = db.prepare(
        'SELECT to_user_id FROM friend_requests WHERE from_user_id = ? AND status = ?'
      ).all(excludeUserId, 'pending');
      sent.forEach(r => excludeIds.add(r.to_user_id));
      const received = db.prepare(
        'SELECT from_user_id FROM friend_requests WHERE to_user_id = ? AND status = ?'
      ).all(excludeUserId, 'pending');
      received.forEach(r => excludeIds.add(r.from_user_id));
      return all
        .filter(u => !excludeIds.has(u.id))
        .slice(0, limit)
        .map(u => ({ id: String(u.id), username: u.email || '' }));
    }
  } catch (err) {
    console.error('[searchUsersByEmail] Error:', err.message);
    return [];
  }
}

async function findUserById(id) {
  if (usePostgres) {
    const result = await pool.query(
      'SELECT id, email, password, role, dark_mode, access_level, stripe_customer_id, stripe_subscription_id, trial_ends_at FROM users WHERE id = $1',
      [id]
    );
    const user = result.rows[0] || null;
    if (user) {
      user.dark_mode = user.dark_mode ?? false;
      // Ensure jonakfir@gmail.com always has admin role
      if (user.email && toEmailKey(user.email) === 'jonakfir@gmail.com' && user.role !== 'admin') {
        await updateUserRole(user.id, 'admin');
        user.role = 'admin';
      }
    }
    return user;
  } else {
    const user = db
      .prepare('SELECT id, email, password, role, dark_mode, access_level, stripe_customer_id, stripe_subscription_id, trial_ends_at FROM users WHERE id = ?')
      .get(id) || null;
    if (user) {
      user.dark_mode = user.dark_mode ? Boolean(user.dark_mode) : false;
      // Ensure jonakfir@gmail.com always has admin role
      if (user.email && toEmailKey(user.email) === 'jonakfir@gmail.com' && user.role !== 'admin') {
        await updateUserRole(user.id, 'admin');
        user.role = 'admin';
      }
    }
    return user;
  }
}

async function deleteUserById(id) {
  if (usePostgres) {
    const result = await pool.query('DELETE FROM users WHERE id = $1', [id]);
    return { changes: result.rowCount };
  } else {
    return db.prepare('DELETE FROM users WHERE id = ?').run(id);
  }
}

async function updateUserEmailAndOrPassword(id, { email, password }) {
  const patches = [];
  const args = [];
  let paramIndex = 1;
  
  if (email != null) {
    patches.push(`email = $${paramIndex++}`);
    args.push(toEmailKey(email));
  }
  if (password != null) {
    patches.push(`password = $${paramIndex++}`);
    args.push(password);
  }
  
  if (patches.length === 0) return { changes: 0 };
  
  args.push(id);
  
  if (usePostgres) {
    const sql = `UPDATE users SET ${patches.join(', ')} WHERE id = $${paramIndex}`;
    const result = await pool.query(sql, args);
    return { changes: result.rowCount };
  } else {
    const patchesSql = [];
    const argsSql = [];
    if (email != null) { patchesSql.push('email = ?'); argsSql.push(toEmailKey(email)); }
    if (password != null) { patchesSql.push('password = ?'); argsSql.push(password); }
    argsSql.push(id);
    const sql = `UPDATE users SET ${patchesSql.join(', ')} WHERE id = ?`;
    return db.prepare(sql).run(...argsSql);
  }
}

async function updateUserDarkMode(id, darkMode) {
  if (usePostgres) {
    const result = await pool.query(
      'UPDATE users SET dark_mode = $1 WHERE id = $2',
      [darkMode, id]
    );
    return { changes: result.rowCount };
  } else {
    return db.prepare('UPDATE users SET dark_mode = ? WHERE id = ?').run(darkMode ? 1 : 0, id);
  }
}

async function countUsers() {
  if (usePostgres) {
    const result = await pool.query('SELECT COUNT(*) as count FROM users');
    return parseInt(result.rows[0].count, 10);
  } else {
    const result = db.prepare('SELECT COUNT(*) as count FROM users').get();
    return result.count || 0;
  }
}

// -------------------------
// Role Management Functions
// -------------------------
async function getUserRole(userId) {
  if (usePostgres) {
    const result = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
    return result.rows[0]?.role || null;
  } else {
    const result = db.prepare('SELECT role FROM users WHERE id = ?').get(userId);
    return result?.role || null;
  }
}

async function updateUserRole(userId, role) {
  if (usePostgres) {
    const result = await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, userId]);
    return { changes: result.rowCount };
  } else {
    return db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
  }
}

async function updateUserAccessLevel(userId, accessLevel, trialEndsAt) {
  const level = accessLevel && ['pro', 'free_trial', 'none'].includes(accessLevel) ? accessLevel : 'none';
  if (usePostgres) {
    if (trialEndsAt !== undefined) {
      const ts = trialEndsAt === null || trialEndsAt === '' ? null : (typeof trialEndsAt === 'string' ? trialEndsAt : new Date(trialEndsAt).toISOString());
      const result = await pool.query('UPDATE users SET access_level = $1, trial_ends_at = $2 WHERE id = $3', [level, ts, userId]);
      return { changes: result.rowCount };
    }
    const result = await pool.query('UPDATE users SET access_level = $1 WHERE id = $2', [level, userId]);
    return { changes: result.rowCount };
  } else {
    if (trialEndsAt !== undefined) {
      const ts = trialEndsAt === null || trialEndsAt === '' ? null : (typeof trialEndsAt === 'string' ? trialEndsAt : new Date(trialEndsAt).toISOString());
      return db.prepare('UPDATE users SET access_level = ?, trial_ends_at = ? WHERE id = ?').run(level, ts, userId);
    }
    return db.prepare('UPDATE users SET access_level = ? WHERE id = ?').run(level, userId);
  }
}

async function findUserByStripeCustomerId(stripeCustomerId) {
  if (!stripeCustomerId) return null;
  if (usePostgres) {
    const result = await pool.query(
      'SELECT id, email, access_level, stripe_customer_id, stripe_subscription_id FROM users WHERE stripe_customer_id = $1',
      [stripeCustomerId]
    );
    return result.rows[0] || null;
  } else {
    return db.prepare(
      'SELECT id, email, access_level, stripe_customer_id, stripe_subscription_id FROM users WHERE stripe_customer_id = ?'
    ).get(stripeCustomerId) || null;
  }
}

async function updateUserStripeIds(userId, { stripeCustomerId, stripeSubscriptionId }) {
  const updates = [];
  const args = [];
  let pi = 1;
  if (stripeCustomerId !== undefined) {
    updates.push(usePostgres ? `stripe_customer_id = $${pi++}` : 'stripe_customer_id = ?');
    args.push(stripeCustomerId || null);
  }
  if (stripeSubscriptionId !== undefined) {
    updates.push(usePostgres ? `stripe_subscription_id = $${pi++}` : 'stripe_subscription_id = ?');
    args.push(stripeSubscriptionId || null);
  }
  if (updates.length === 0) return { changes: 0 };
  args.push(userId);
  if (usePostgres) {
    const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = $${pi}`;
    const result = await pool.query(sql, args);
    return { changes: result.rowCount };
  } else {
    const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
    return db.prepare(sql).run(...args);
  }
}

// -------------------------
// Organization Functions
// -------------------------
async function createOrganization({ name, description, createdByUserId }) {
  if (usePostgres) {
    const result = await pool.query(
      'INSERT INTO organizations (name, description, created_by_user_id) VALUES ($1, $2, $3) RETURNING *',
      [name, description || null, createdByUserId]
    );
    return result.rows[0];
  } else {
    const stmt = db.prepare('INSERT INTO organizations (name, description, created_by_user_id) VALUES (?, ?, ?)');
    const info = stmt.run(name, description || null, createdByUserId);
    return findOrganizationById(Number(info.lastInsertRowid));
  }
}

async function findOrganizationById(id) {
  if (usePostgres) {
    const result = await pool.query('SELECT * FROM organizations WHERE id = $1', [id]);
    return result.rows[0] || null;
  } else {
    return db.prepare('SELECT * FROM organizations WHERE id = ?').get(id) || null;
  }
}

async function findOrganizationsByUserId(userId) {
  if (usePostgres) {
    const result = await pool.query(`
      SELECT DISTINCT o.* 
      FROM organizations o
      LEFT JOIN organization_memberships om ON o.id = om.organization_id
      WHERE o.created_by_user_id = $1 OR om.user_id = $1
      ORDER BY o.created_at DESC
    `, [userId]);
    return result.rows;
  } else {
    return db.prepare(`
      SELECT DISTINCT o.* 
      FROM organizations o
      LEFT JOIN organization_memberships om ON o.id = om.organization_id
      WHERE o.created_by_user_id = ? OR om.user_id = ?
      ORDER BY o.created_at DESC
    `).all(userId, userId);
  }
}

/** Admin only: return all organizations with creator email and member counts */
async function findAllOrganizationsForAdmin() {
  if (usePostgres) {
    const result = await pool.query(`
      SELECT o.id, o.name, o.description, o.status, o.created_by_user_id, o.created_at,
        u.email AS creator_email,
        (SELECT COUNT(*) FROM organization_memberships om WHERE om.organization_id = o.id AND om.status = 'approved') AS member_count,
        (SELECT COUNT(*) FROM organization_memberships om WHERE om.organization_id = o.id AND om.status = 'pending') AS pending_count
      FROM organizations o
      LEFT JOIN users u ON u.id = o.created_by_user_id
      ORDER BY o.created_at DESC
    `);
    return result.rows;
  } else {
    const orgs = db.prepare('SELECT * FROM organizations ORDER BY created_at DESC').all();
    return orgs.map(o => {
      const creator = db.prepare('SELECT email FROM users WHERE id = ?').get(o.created_by_user_id);
      const counts = db.prepare(`
        SELECT status, COUNT(*) AS c FROM organization_memberships WHERE organization_id = ? GROUP BY status
      `).all(o.id);
      const memberCount = counts.find(r => r.status === 'approved')?.c ?? 0;
      const pendingCount = counts.find(r => r.status === 'pending')?.c ?? 0;
      return {
        id: o.id,
        name: o.name,
        description: o.description,
        status: o.status,
        created_by_user_id: o.created_by_user_id,
        created_at: o.created_at,
        creator_email: creator?.email ?? null,
        member_count: Number(memberCount),
        pending_count: Number(pendingCount)
      };
    });
  }
}

async function addUserToOrganization({ organizationId, userId, role = 'member' }) {
  if (usePostgres) {
    const result = await pool.query(
      'INSERT INTO organization_memberships (organization_id, user_id, role, status) VALUES ($1, $2, $3, $4) ON CONFLICT (organization_id, user_id) DO UPDATE SET role = $3, status = $4 RETURNING *',
      [organizationId, userId, role, 'approved']
    );
    return result.rows[0];
  } else {
    // SQLite: Check if membership exists first
    const existing = db.prepare('SELECT * FROM organization_memberships WHERE organization_id = ? AND user_id = ?').get(organizationId, userId);
    if (existing) {
      // Update existing membership
      db.prepare('UPDATE organization_memberships SET role = ?, status = ? WHERE organization_id = ? AND user_id = ?').run(role, 'approved', organizationId, userId);
      return findOrganizationMembershipById(existing.id);
    } else {
      // Insert new membership
      const stmt = db.prepare('INSERT INTO organization_memberships (organization_id, user_id, role, status) VALUES (?, ?, ?, ?)');
      const info = stmt.run(organizationId, userId, role, 'approved');
      return findOrganizationMembershipById(Number(info.lastInsertRowid));
    }
  }
}

async function removeUserFromOrganization({ organizationId, userId }) {
  if (usePostgres) {
    const result = await pool.query(
      'DELETE FROM organization_memberships WHERE organization_id = $1 AND user_id = $2',
      [organizationId, userId]
    );
    return { changes: result.rowCount };
  } else {
    return db.prepare('DELETE FROM organization_memberships WHERE organization_id = ? AND user_id = ?').run(organizationId, userId);
  }
}

async function getOrganizationMembers(organizationId) {
  if (usePostgres) {
    const result = await pool.query(`
      SELECT u.id, u.email, u.role as user_role, om.role as membership_role, om.status, om.joined_at
      FROM organization_memberships om
      JOIN users u ON om.user_id = u.id
      WHERE om.organization_id = $1 AND om.status = 'approved'
      ORDER BY om.joined_at DESC
    `, [organizationId]);
    return result.rows;
  } else {
    return db.prepare(`
      SELECT u.id, u.email, u.role as user_role, om.role as membership_role, om.status, om.joined_at
      FROM organization_memberships om
      JOIN users u ON om.user_id = u.id
      WHERE om.organization_id = ? AND om.status = 'approved'
      ORDER BY om.joined_at DESC
    `).all(organizationId);
  }
}

async function findOrganizationMembershipById(id) {
  if (usePostgres) {
    const result = await pool.query('SELECT * FROM organization_memberships WHERE id = $1', [id]);
    return result.rows[0] || null;
  } else {
    return db.prepare('SELECT * FROM organization_memberships WHERE id = ?').get(id) || null;
  }
}

// -------------------------
// Friendship Functions
// -------------------------
async function createFriendRequest({ fromUserId, toUserId }) {
  if (usePostgres) {
    const result = await pool.query(
      'INSERT INTO friend_requests (from_user_id, to_user_id) VALUES ($1, $2) ON CONFLICT (from_user_id, to_user_id) DO NOTHING RETURNING *',
      [fromUserId, toUserId]
    );
    return result.rows[0] || null;
  } else {
    try {
      const stmt = db.prepare('INSERT INTO friend_requests (from_user_id, to_user_id) VALUES (?, ?)');
      const info = stmt.run(fromUserId, toUserId);
      return findFriendRequestById(Number(info.lastInsertRowid));
    } catch (err) {
      // Handle unique constraint violation
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return null;
      }
      throw err;
    }
  }
}

async function acceptFriendRequest({ requestId }) {
  if (usePostgres) {
    // Get the request
    const requestResult = await pool.query('SELECT * FROM friend_requests WHERE id = $1', [requestId]);
    if (requestResult.rows.length === 0) return null;
    
    const request = requestResult.rows[0];
    if (request.status !== 'pending') return null;
    
    // Update request status
    await pool.query(
      'UPDATE friend_requests SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['accepted', requestId]
    );
    
    // Create friendship (ensure user1_id < user2_id)
    const user1Id = Math.min(request.from_user_id, request.to_user_id);
    const user2Id = Math.max(request.from_user_id, request.to_user_id);
    
    await pool.query(
      'INSERT INTO friendships (user1_id, user2_id) VALUES ($1, $2) ON CONFLICT (user1_id, user2_id) DO NOTHING',
      [user1Id, user2Id]
    );
    
    return findFriendshipByUsers(user1Id, user2Id);
  } else {
    const request = db.prepare('SELECT * FROM friend_requests WHERE id = ?').get(requestId);
    if (!request || request.status !== 'pending') return null;
    
    db.prepare('UPDATE friend_requests SET status = ?, updated_at = datetime("now") WHERE id = ?').run('accepted', requestId);
    
    const user1Id = Math.min(request.from_user_id, request.to_user_id);
    const user2Id = Math.max(request.from_user_id, request.to_user_id);
    
    try {
      db.prepare('INSERT INTO friendships (user1_id, user2_id) VALUES (?, ?)').run(user1Id, user2Id);
    } catch (err) {
      // Ignore unique constraint violation
    }
    
    return findFriendshipByUsers(user1Id, user2Id);
  }
}

async function declineFriendRequest({ requestId }) {
  if (usePostgres) {
    const result = await pool.query(
      'UPDATE friend_requests SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      ['declined', requestId]
    );
    return result.rows[0] || null;
  } else {
    db.prepare('UPDATE friend_requests SET status = ?, updated_at = datetime("now") WHERE id = ?').run('declined', requestId);
    return db.prepare('SELECT * FROM friend_requests WHERE id = ?').get(requestId) || null;
  }
}

async function getFriendships(userId) {
  if (usePostgres) {
    const result = await pool.query(`
      SELECT f.*, 
             CASE WHEN f.user1_id = $1 THEN u2.id ELSE u1.id END as friend_id,
             CASE WHEN f.user1_id = $1 THEN u2.email ELSE u1.email END as friend_email
      FROM friendships f
      JOIN users u1 ON f.user1_id = u1.id
      JOIN users u2 ON f.user2_id = u2.id
      WHERE f.user1_id = $1 OR f.user2_id = $1
      ORDER BY f.created_at DESC
    `, [userId]);
    return result.rows;
  } else {
    return db.prepare(`
      SELECT f.*, 
             CASE WHEN f.user1_id = ? THEN u2.id ELSE u1.id END as friend_id,
             CASE WHEN f.user1_id = ? THEN u2.email ELSE u1.email END as friend_email
      FROM friendships f
      JOIN users u1 ON f.user1_id = u1.id
      JOIN users u2 ON f.user2_id = u2.id
      WHERE f.user1_id = ? OR f.user2_id = ?
      ORDER BY f.created_at DESC
    `).all(userId, userId, userId, userId);
  }
}

async function getFriendRequests(userId) {
  if (usePostgres) {
    const sentResult = await pool.query(`
      SELECT fr.*, u.email as to_user_email
      FROM friend_requests fr
      JOIN users u ON fr.to_user_id = u.id
      WHERE fr.from_user_id = $1 AND fr.status = 'pending'
      ORDER BY fr.created_at DESC
    `, [userId]);
    
    const receivedResult = await pool.query(`
      SELECT fr.*, u.email as from_user_email
      FROM friend_requests fr
      JOIN users u ON fr.from_user_id = u.id
      WHERE fr.to_user_id = $1 AND fr.status = 'pending'
      ORDER BY fr.created_at DESC
    `, [userId]);
    
    return {
      sent: sentResult.rows,
      received: receivedResult.rows
    };
  } else {
    const sent = db.prepare(`
      SELECT fr.*, u.email as to_user_email
      FROM friend_requests fr
      JOIN users u ON fr.to_user_id = u.id
      WHERE fr.from_user_id = ? AND fr.status = 'pending'
      ORDER BY fr.created_at DESC
    `).all(userId);
    
    const received = db.prepare(`
      SELECT fr.*, u.email as from_user_email
      FROM friend_requests fr
      JOIN users u ON fr.from_user_id = u.id
      WHERE fr.to_user_id = ? AND fr.status = 'pending'
      ORDER BY fr.created_at DESC
    `).all(userId);
    
    return { sent, received };
  }
}

async function findFriendRequestById(id) {
  if (usePostgres) {
    const result = await pool.query('SELECT * FROM friend_requests WHERE id = $1', [id]);
    return result.rows[0] || null;
  } else {
    return db.prepare('SELECT * FROM friend_requests WHERE id = ?').get(id) || null;
  }
}

async function findFriendshipByUsers(user1Id, user2Id) {
  const minId = Math.min(user1Id, user2Id);
  const maxId = Math.max(user1Id, user2Id);
  
  if (usePostgres) {
    const result = await pool.query('SELECT * FROM friendships WHERE user1_id = $1 AND user2_id = $2', [minId, maxId]);
    return result.rows[0] || null;
  } else {
    return db.prepare('SELECT * FROM friendships WHERE user1_id = ? AND user2_id = ?').get(minId, maxId) || null;
  }
}

// -------------------------
// User Profile Functions (onboarding data: age, verbal, literate, goals - tied to each user)
// -------------------------
async function createUserProfile(userId, profile) {
  const {
    user_type,
    beneficiary_name,
    is_over_18,
    birthday,
    is_verbal,
    is_literate,
    goal,
    teacher_email,
    doctor_email,
    doctor_name,
    parent_name,
    parent_email
  } = profile;

  if (usePostgres) {
    const result = await pool.query(
      `INSERT INTO user_profiles (
        user_id, user_type, beneficiary_name, is_over_18, birthday,
        is_verbal, is_literate, goal, teacher_email, doctor_email, doctor_name,
        parent_name, parent_email
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (user_id) DO UPDATE SET
        user_type = EXCLUDED.user_type,
        beneficiary_name = EXCLUDED.beneficiary_name,
        is_over_18 = EXCLUDED.is_over_18,
        birthday = EXCLUDED.birthday,
        is_verbal = EXCLUDED.is_verbal,
        is_literate = EXCLUDED.is_literate,
        goal = EXCLUDED.goal,
        teacher_email = EXCLUDED.teacher_email,
        doctor_email = EXCLUDED.doctor_email,
        doctor_name = EXCLUDED.doctor_name,
        parent_name = EXCLUDED.parent_name,
        parent_email = EXCLUDED.parent_email,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *`,
      [userId, user_type || 'myself', beneficiary_name || null, is_over_18 ?? null, birthday || null,
       is_verbal ?? null, is_literate ?? null, goal || null, teacher_email || null, doctor_email || null,
       doctor_name || null, parent_name || null, parent_email || null]
    );
    return result.rows[0];
  } else {
    const stmt = db.prepare(`
      INSERT INTO user_profiles (
        user_id, user_type, beneficiary_name, is_over_18, birthday,
        is_verbal, is_literate, goal, teacher_email, doctor_email, doctor_name,
        parent_name, parent_email
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (user_id) DO UPDATE SET
        user_type = excluded.user_type,
        beneficiary_name = excluded.beneficiary_name,
        is_over_18 = excluded.is_over_18,
        birthday = excluded.birthday,
        is_verbal = excluded.is_verbal,
        is_literate = excluded.is_literate,
        goal = excluded.goal,
        teacher_email = excluded.teacher_email,
        doctor_email = excluded.doctor_email,
        doctor_name = excluded.doctor_name,
        parent_name = excluded.parent_name,
        parent_email = excluded.parent_email,
        updated_at = datetime('now')
    `);
    stmt.run(userId, user_type || 'myself', beneficiary_name || null, is_over_18 != null ? (is_over_18 ? 1 : 0) : null,
      birthday || null, is_verbal != null ? (is_verbal ? 1 : 0) : null, is_literate != null ? (is_literate ? 1 : 0) : null,
      goal || null, teacher_email || null, doctor_email || null, doctor_name || null, parent_name || null, parent_email || null);
    return findUserProfileByUserId(userId);
  }
}

async function findUserProfileByUserId(userId) {
  if (usePostgres) {
    const result = await pool.query('SELECT * FROM user_profiles WHERE user_id = $1', [userId]);
    const row = result.rows[0] || null;
    if (row && row.is_over_18 !== null) row.is_over_18 = Boolean(row.is_over_18);
    if (row && row.is_verbal !== null) row.is_verbal = Boolean(row.is_verbal);
    if (row && row.is_literate !== null) row.is_literate = Boolean(row.is_literate);
    return row;
  } else {
    const row = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(userId) || null;
    if (row && row.is_over_18 != null) row.is_over_18 = Boolean(row.is_over_18);
    if (row && row.is_verbal != null) row.is_verbal = Boolean(row.is_verbal);
    if (row && row.is_literate != null) row.is_literate = Boolean(row.is_literate);
    return row;
  }
}

module.exports = {
  db: usePostgres ? pool : db,
  pool: usePostgres ? pool : null,
  createUser,
  findUserByEmail,
  findUserByUsername,
  findUserById,
  deleteUserById,
  updateUserEmailAndOrPassword,
  updateUserDarkMode,
  countUsers,
  getUserRole,
  updateUserRole,
  updateUserAccessLevel,
  findUserByStripeCustomerId,
  updateUserStripeIds,
  createOrganization,
  findOrganizationById,
  findOrganizationsByUserId,
  findAllOrganizationsForAdmin,
  addUserToOrganization,
  removeUserFromOrganization,
  getOrganizationMembers,
  createFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  getFriendships,
  getFriendRequests,
  findFriendRequestById,
  findFriendshipByUsers,
  searchUsersByEmail,
  createUserProfile,
  findUserProfileByUserId,
  initializeSchema, // Export for emergency initialization
  schemaInitPromise // Export so server can wait for it
};
