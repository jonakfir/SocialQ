# Quick Start Guide

## 🚀 Start Both Servers (FASTEST)

```bash
./start-all.sh
```

Or using npm:
```bash
npm start
```

## 🛑 Stop All Servers

```bash
./stop-all.sh
```

Or using npm:
```bash
npm stop
```

## 📝 Start Individual Servers

**Backend only:**
```bash
./start-backend.sh
# or
npm run start:backend
```

**Frontend only:**
```bash
./start-frontend.sh
# or
npm run start:frontend
```

## 📊 View Logs

**Backend logs:**
```bash
tail -f /tmp/backend.log
```

**Frontend logs:**
```bash
tail -f /tmp/frontend.log
```

## 🌐 URLs

- **Backend:** http://localhost:8080
- **Frontend:** http://localhost:5173

## ⚡ That's it!

Just run `./start-all.sh` and both servers start in seconds!

