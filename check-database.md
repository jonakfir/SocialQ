# How to Check the Database

## Database Locations

1. **Backend Database** (SQLite): `backend/data/app.db`
   - Stores users with email/password for backend authentication
   
2. **Prisma Database** (SQLite): `frontend/prisma/dev.db`
   - Stores users with username (email), password, and 9-digit IDs for frontend features

## Commands to Check Databases

### Check Backend Database (users table)
```bash
cd backend
sqlite3 data/app.db

# Then run SQL commands:
.tables                    # List all tables
SELECT * FROM users;       # Show all users
SELECT id, email FROM users WHERE email LIKE '%jonakfir%';
.quit                      # Exit
```

### Check Prisma Database (User table)
```bash
cd frontend
sqlite3 prisma/dev.db

# Then run SQL commands:
.tables                    # List all tables
PRAGMA table_info(User);  # Show User table structure
SELECT * FROM User;        # Show all users
SELECT id, username FROM User WHERE username LIKE '%jonakfir%';
.quit                      # Exit
```

### Quick One-Line Queries

**Backend:**
```bash
cd backend && sqlite3 data/app.db "SELECT id, email FROM users;"
```

**Prisma:**
```bash
cd frontend && sqlite3 prisma/dev.db "SELECT id, username FROM User;"
```

## Using Prisma Studio (Visual Database Browser)

```bash
cd frontend
npx prisma studio
```

This opens a web interface at `http://localhost:5555` where you can browse and edit the database visually.

## Note About Passwords

Passwords are hashed with bcrypt, so you'll see something like:
`$2a$12$abcdefghijklmnopqrstuvwxyz...`

You cannot see the original password, but you can:
1. Update it to a new password using Prisma Studio
2. Or use SQL to update it (you'll need to hash it first with bcrypt)

