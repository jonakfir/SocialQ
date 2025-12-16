// backend/db/db.js
const { Pool } = require('pg');

// -------------------------
// Database Connection
// -------------------------
// Use DATABASE_URL if available (Railway provides this), otherwise fall back to SQLite
const DATABASE_URL = process.env.DATABASE_URL;

let db = null;
let pool = null;
let usePostgres = false;

if (DATABASE_URL && DATABASE_URL.startsWith('postgresql://')) {
  // Use PostgreSQL
  usePostgres = true;
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    // Add connection retry settings
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });
  
  console.log('[DB] Using PostgreSQL');
  console.log('[DB] DATABASE_URL:', DATABASE_URL.replace(/:[^:@]+@/, ':****@')); // Hide password
  
  // Test connection and log errors
  pool.query('SELECT NOW()', (err) => {
    if (err) {
      console.error('[DB] PostgreSQL connection error:', err.message);
      console.error('[DB] Connection error details:', err);
    } else {
      console.log('[DB] PostgreSQL connected successfully');
    }
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
        
        // Ensure pool is ready - test connection first with retry
        let connected = false;
        for (let connAttempt = 1; connAttempt <= 5; connAttempt++) {
          try {
            const result = await pool.query('SELECT NOW(), current_database(), current_schema()');
            console.log('[DB] ✅ Database connection verified at', result.rows[0].now);
            console.log('[DB] Connected to database:', result.rows[0].current_database);
            console.log('[DB] Current schema:', result.rows[0].current_schema);
            connected = true;
            break;
          } catch (connErr) {
            console.error(`[DB] ❌ Database connection failed (attempt ${connAttempt}/5):`, connErr.message);
            if (connAttempt < 5) {
              const waitTime = 2000 * connAttempt;
              console.log(`[DB] Waiting ${waitTime}ms before retry...`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
            } else {
              throw new Error(`Database connection failed after 5 attempts: ${connErr.message}`);
            }
          }
        }
        
        if (!connected) {
          throw new Error('Failed to establish database connection');
        }
        
        // PostgreSQL schema - Users table
        await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id         SERIAL PRIMARY KEY,
          email      TEXT UNIQUE NOT NULL,
          password   TEXT NOT NULL,
          role       TEXT DEFAULT 'personal' CHECK (role IN ('admin', 'personal', 'org_admin')),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
  }
}

// Initialize schema on load - but export a promise so server can wait
const schemaInitPromise = initializeSchema()
  .then(() => {
    console.log('[DB] ✅ Schema initialization completed successfully');
    return true;
  })
  .catch(err => {
    console.error('[DB] ❌ Schema initialization error:', err);
    console.error('[DB] Error details:', err.message);
    throw err;
  });

// -------------------------
// Helpers (email-centric)
// -------------------------
function toEmailKey(email) {
  return String(email || '').trim().toLowerCase();
}

async function createUser({ email, password, role }) {
  try {
    const e = toEmailKey(email);
    console.log('[createUser] Creating user with email:', e);
    
    // Ensure jonakfir@gmail.com is always admin
    let userRole = role || 'personal';
    if (e === 'jonakfir@gmail.com') {
      userRole = 'admin';
    }
    
    if (usePostgres) {
      console.log('[createUser] Using PostgreSQL');
      const result = await pool.query(
        'INSERT INTO users (email, password, role) VALUES ($1, $2, $3) RETURNING id, email, role',
        [e, password, userRole]
      );
      console.log('[createUser] User created, ID:', result.rows[0].id, 'Role:', result.rows[0].role);
      return { id: Number(result.rows[0].id), email: result.rows[0].email, role: result.rows[0].role };
    } else {
      console.log('[createUser] Using SQLite');
      const stmt = db.prepare('INSERT INTO users (email, password, role) VALUES (?, ?, ?)');
      const info = stmt.run(e, password, userRole);
      console.log('[createUser] User created, ID:', info.lastInsertRowid, 'Role:', userRole);
      return { id: Number(info.lastInsertRowid), email: e, role: userRole };
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
        'SELECT id, email, password, role FROM users WHERE email = $1',
        [e]
      );
      const user = result.rows[0] || null;
      // Ensure jonakfir@gmail.com always has admin role
      if (user && e === 'jonakfir@gmail.com' && user.role !== 'admin') {
        await updateUserRole(user.id, 'admin');
        user.role = 'admin';
      }
      return user;
    } else {
      const user = db
        .prepare('SELECT id, email, password, role FROM users WHERE email = ?')
        .get(e) || null;
      // Ensure jonakfir@gmail.com always has admin role
      if (user && e === 'jonakfir@gmail.com' && user.role !== 'admin') {
        await updateUserRole(user.id, 'admin');
        user.role = 'admin';
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

async function findUserById(id) {
  if (usePostgres) {
    const result = await pool.query(
      'SELECT id, email, password, role FROM users WHERE id = $1',
      [id]
    );
    const user = result.rows[0] || null;
    // Ensure jonakfir@gmail.com always has admin role
    if (user && user.email && toEmailKey(user.email) === 'jonakfir@gmail.com' && user.role !== 'admin') {
      await updateUserRole(user.id, 'admin');
      user.role = 'admin';
    }
    return user;
  } else {
    const user = db
      .prepare('SELECT id, email, password, role FROM users WHERE id = ?')
      .get(id) || null;
    // Ensure jonakfir@gmail.com always has admin role
    if (user && user.email && toEmailKey(user.email) === 'jonakfir@gmail.com' && user.role !== 'admin') {
      await updateUserRole(user.id, 'admin');
      user.role = 'admin';
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
      WHERE fr.from_user_id = $1
      ORDER BY fr.created_at DESC
    `, [userId]);
    
    const receivedResult = await pool.query(`
      SELECT fr.*, u.email as from_user_email
      FROM friend_requests fr
      JOIN users u ON fr.from_user_id = u.id
      WHERE fr.to_user_id = $1
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
      WHERE fr.from_user_id = ?
      ORDER BY fr.created_at DESC
    `).all(userId);
    
    const received = db.prepare(`
      SELECT fr.*, u.email as from_user_email
      FROM friend_requests fr
      JOIN users u ON fr.from_user_id = u.id
      WHERE fr.to_user_id = ?
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

module.exports = {
  db: usePostgres ? pool : db,
  pool: usePostgres ? pool : null,
  createUser,
  findUserByEmail,
  findUserByUsername,
  findUserById,
  deleteUserById,
  updateUserEmailAndOrPassword,
  countUsers,
  getUserRole,
  updateUserRole,
  createOrganization,
  findOrganizationById,
  findOrganizationsByUserId,
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
  initializeSchema, // Export for emergency initialization
  schemaInitPromise // Export so server can wait for it
};
