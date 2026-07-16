# 🚀 QUICK START GUIDE

## Prerequisites Check

Before running, ensure you have:
- [ ] Node.js 18+ installed (`node --version`)
- [ ] MongoDB installed OR MongoDB Atlas account
- [ ] OpenAI API key (from https://platform.openai.com/api-keys)
- [ ] Terminal/command line access

---

## 🏃 Fast Setup (5 Commands)

```bash
# 1. Start MongoDB (if using local)
brew services start mongodb-community  # macOS
# OR on Linux: sudo systemctl start mongod
# OR use MongoDB Atlas (skip this step)

# 2. Setup Backend
cd backend
npm install
cp .env.example .env
# EDIT .env: Add MONGODB_URI, JWT_SECRET, OPENAI_API_KEY
npm run dev  # Leave this running

# 3. Setup Frontend (in NEW terminal)
cd frontend
npm install
npm run dev  # Leave this running

# 4. Open Browser
# Go to: http://localhost:5173
```

---

## 📝 Step-by-Step Instructions

### Step 1: Clone or Navigate to Project

```bash
cd /Users/ankitsaraf/Project\ Code/InterviewPrepared/interviewPrepaired
```

### Step 2: Install MongoDB

**Option A - Local (Recommended for Development)**:

```bash
# macOS
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community

# Verify installation
mongosh --version
# OR
mongo --version
```

**Option B - MongoDB Atlas (Cloud)**:

1. Go to https://www.mongodb.com/cloud/atlas
2. Sign up (free)
3. Create cluster (free M0 tier)
4. Click "Connect" → "Connect your application"
5. Copy connection string (format: `mongodb+srv://...`)
6. Replace `<password>` with your actual password

### Step 3: Get OpenAI API Key

1. Go to https://platform.openai.com/api-keys
2. Sign in or create account
3. Click "+ Create new secret key"
4. Name it "Interview Coach"
5. Copy the key (starts with `sk-`)
6. Save it securely (you'll need it next)

**Cost**: ~$0.50-1.00 per interview

### Step 4: Configure Backend

```bash
cd backend

# Install dependencies (takes 2-3 minutes)
npm install

# Create environment file
cp .env.example .env

# Edit .env file
nano .env  # or use: code .env (VS Code) or vim .env
```

**Add these values to backend/.env**:

```env
# Server Configuration
PORT=5000
NODE_ENV=development

# MongoDB Configuration (CHOOSE ONE)
# Option A: Local MongoDB
MONGODB_URI=mongodb://localhost:27017/interview-coach

# Option B: MongoDB Atlas
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/interview-coach

# JWT Configuration (REQUIRED)
JWT_SECRET=my-super-secret-key-for-development-change-in-prod
JWT_EXPIRE=7d

# OpenAI Configuration (REQUIRED)
OPENAI_API_KEY=sk-your-actual-api-key-here

# CORS Configuration
CORS_ORIGIN=http://localhost:5173

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
LOG_FILE=logs/app.log
```

**Save the file** (Ctrl+O, Enter, Ctrl+X in nano)

### Step 5: Start Backend Server

```bash
# Still in backend folder
npm run dev
```

**Expected Output**:
```
[nodemon] starting `ts-node src/server.ts`
🚀 Server running on port 5000
📝 Environment: development
🔗 CORS Origin: http://localhost:5173
✅ MongoDB Connected to interview-coach
```

**If you see errors**:
- "MongoDB connection failed" → Check MONGODB_URI
- "OPENAI_API_KEY is required" → Check .env file
- Port already in use → Stop other apps on port 5000

**Leave this terminal running!**

### Step 6: Configure Frontend

**Open a NEW terminal** (keep backend running):

```bash
cd frontend

# Install dependencies (takes 2-3 minutes)
npm install

# Create environment file
cp .env.example .env

# Edit .env file (optional, defaults are fine for local dev)
nano .env
```

**frontend/.env contents**:
```env
# API Configuration
VITE_API_BASE_URL=http://localhost:5000/api

# Environment
VITE_NODE_ENV=development
```

### Step 7: Start Frontend Server

```bash
# Still in frontend folder
npm run dev
```

**Expected Output**:
```
  VITE v5.0.8  ready in 482 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
  ➜  press h to show help
```

**Leave this terminal running too!**

### Step 8: Open Browser and Test

1. Open browser: http://localhost:5173
2. You should see **Interview Setup Page**

---

## 🧪 Test the Application

### Complete Flow Test

1. **Setup Interview**
   - Select topic: "React"
   - Select difficulty: "Intermediate"
   - Enter experience: 3 years
   - Set questions: 3 (for quick test)
   - Click "Start Interview"

2. **Interview Page**
   - You should see first question
   - Click microphone button (allow permissions)
   - Speak an answer (or type if mic doesn't work)
   - Click "Submit Answer"
   - Wait for evaluation (~5 seconds)
   - See scores and feedback
   - Click "Continue"
   - Repeat for remaining questions

3. **Report Dashboard**
   - After completing all questions
   - Click "View Detailed Report"
   - Should see:
     - Overall score
     - 5 dimensional scores
     - Radar chart
     - Bar chart
     - Strengths/weaknesses
   - Try exporting CSV or JSON

---

## ✅ Verification Checklist

### Backend Working
- [ ] Terminal shows "Server running on port 5000"
- [ ] Terminal shows "MongoDB Connected"
- [ ] No error messages in terminal
- [ ] `curl http://localhost:5000/health` returns success

### Frontend Working
- [ ] Browser opens http://localhost:5173
- [ ] No errors in browser console (F12)
- [ ] Setup page loads with form
- [ ] Can select dropdowns
- [ ] "Start Interview" button is clickable

### Full Integration
- [ ] Can create interview
- [ ] Navigates to interview page
- [ ] Question displays
- [ ] Can record/type answer
- [ ] Can submit answer
- [ ] Evaluation displays
- [ ] Can complete interview
- [ ] Report loads with charts

---

## 🐛 Common Issues & Solutions

### Issue: "Cannot connect to MongoDB"

**Symptoms**: Backend shows connection error

**Solutions**:
```bash
# Check if MongoDB is running
brew services list | grep mongodb

# Start MongoDB if stopped
brew services start mongodb-community

# Test connection
mongosh
# Should open MongoDB shell

# If using Atlas, verify:
# 1. Connection string is correct
# 2. Password has no special characters
# 3. IP whitelist includes 0.0.0.0/0
```

### Issue: "OPENAI_API_KEY is required"

**Symptoms**: Backend won't start

**Solution**:
```bash
# Check .env file
cat backend/.env | grep OPENAI_API_KEY

# Should show: OPENAI_API_KEY=sk-...
# If not, edit and add your key
nano backend/.env
```

### Issue: "Port 5000 already in use"

**Symptoms**: Backend fails to start

**Solution**:
```bash
# Find what's using port 5000
lsof -i :5000

# Kill the process
kill -9 <PID>

# OR change port in backend/.env
PORT=5001
```

### Issue: Microphone not working

**Symptoms**: Can't record voice

**Solutions**:
1. **Allow microphone permissions** in browser
2. **Use Chrome/Edge** (best support)
3. For production: **Use HTTPS** (required for mic)
4. Fallback: Type answer manually

### Issue: Frontend shows "Network Error"

**Symptoms**: Can't connect to backend

**Solutions**:
```bash
# Check backend is running
curl http://localhost:5000/health

# Check CORS in backend/.env
CORS_ORIGIN=http://localhost:5173

# Check frontend API URL
cat frontend/.env | grep VITE_API_BASE_URL
# Should be: http://localhost:5000/api
```

### Issue: Charts not displaying

**Symptoms**: Report page shows no charts

**Solutions**:
```bash
# Reinstall recharts
cd frontend
npm install recharts@2.10.3

# Clear cache
rm -rf node_modules package-lock.json
npm install
```

---

## 📊 System Requirements

### Minimum
- **CPU**: 2 cores
- **RAM**: 4 GB
- **Disk**: 2 GB free
- **OS**: macOS, Linux, or Windows
- **Node.js**: 18.0.0+
- **npm**: 8.0.0+

### Recommended
- **CPU**: 4+ cores
- **RAM**: 8 GB+
- **Disk**: 5 GB+ free
- **SSD**: For better MongoDB performance

---

## 🔑 Environment Variables Reference

### Backend (.env)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| PORT | No | 5000 | Server port |
| NODE_ENV | No | development | Environment mode |
| MONGODB_URI | **Yes** | - | MongoDB connection string |
| JWT_SECRET | **Yes** | - | JWT signing secret (min 32 chars) |
| OPENAI_API_KEY | **Yes** | - | OpenAI API key |
| CORS_ORIGIN | No | http://localhost:3000 | Allowed frontend URL |
| RATE_LIMIT_WINDOW_MS | No | 900000 | Rate limit window (15 min) |
| RATE_LIMIT_MAX_REQUESTS | No | 100 | Max requests per window |

### Frontend (.env)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| VITE_API_BASE_URL | No | http://localhost:5000/api | Backend API URL |
| VITE_NODE_ENV | No | development | Environment mode |

---

## 🎯 Quick Commands Reference

```bash
# Start MongoDB
brew services start mongodb-community

# Stop MongoDB
brew services stop mongodb-community

# Start Backend
cd backend && npm run dev

# Start Frontend
cd frontend && npm run dev

# Build Backend
cd backend && npm run build

# Build Frontend
cd frontend && npm run build

# Run Tests
cd backend && npm test

# Check Logs
tail -f backend/logs/app.log

# Reset Database
mongosh interview-coach --eval "db.dropDatabase()"
```

---

## 🚀 Ready to Go!

If you've completed all steps:

1. Backend running on http://localhost:5000 ✅
2. Frontend running on http://localhost:5173 ✅
3. MongoDB connected ✅
4. OpenAI API key configured ✅

**You can now use the application!**

Open http://localhost:5173 and start your first interview! 🎤

---

## 📞 Need Help?

1. **Check terminal logs** (backend and frontend)
2. **Check browser console** (F12 → Console tab)
3. **Verify environment variables** in .env files
4. **Ensure MongoDB is running**
5. **Test OpenAI API key** at https://platform.openai.com/playground

Most issues are related to:
- Missing/incorrect environment variables (90%)
- MongoDB not running (5%)
- Port conflicts (3%)
- Dependencies not installed (2%)

---

## 🎉 Success!

You're now running a complete AI-powered interview preparation system with:
- Voice recording and transcription
- AI-generated questions
- Real-time evaluation
- Comprehensive reporting
- Data visualization

**Enjoy practicing your interviews!** 🚀
