# Quick Start Guide

Get the AI Voice Interview Coach backend running in 5 minutes.

## Prerequisites

- Node.js 18+
- MongoDB 7.0+ (or Docker)
- OpenAI API key

## 1. Install Dependencies

```bash
npm install
```

## 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Required
MONGODB_URI=mongodb://localhost:27017/interview-coach
JWT_SECRET=your-super-secret-key-change-this
OPENAI_API_KEY=sk-your-openai-api-key

# Optional
PORT=5000
CORS_ORIGIN=http://localhost:3000
```

## 3. Start MongoDB

### Option A: Local MongoDB
```bash
mongod
```

### Option B: Docker
```bash
docker run -d -p 27017:27017 --name mongodb mongo:7.0
```

### Option C: Docker Compose (Recommended)
```bash
docker-compose up -d mongodb
```

## 4. Start Server

### Development
```bash
npm run dev
```

### Production
```bash
npm run build
npm start
```

## 5. Test API

```bash
# Health check
curl http://localhost:5000/health

# Register user
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "SecurePass123"
  }'
```

## Project Structure

```
backend/
├── src/
│   ├── config/          # Database & environment config
│   ├── controllers/     # Request handlers
│   ├── middleware/      # Auth, logging, error handling
│   ├── models/          # Mongoose schemas
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   ├── utils/           # Utilities
│   ├── types/           # TypeScript types
│   ├── constants/       # Constants
│   ├── validators/      # Validation rules
│   ├── app.ts          # Express app
│   └── server.ts       # Entry point
├── logs/               # Application logs
├── .env               # Environment variables
├── package.json       # Dependencies
└── tsconfig.json      # TypeScript config
```

## Available Scripts

```bash
npm run dev          # Start development server with hot reload
npm run build        # Build TypeScript to JavaScript
npm start            # Start production server
npm test             # Run tests with coverage
npm run lint         # Run ESLint
npm run lint:fix     # Fix ESLint errors
npm run format       # Format code with Prettier
```

## Common Issues

### MongoDB Connection Error

**Problem:** Cannot connect to MongoDB

**Solution:**
1. Check if MongoDB is running: `mongosh` or `docker ps`
2. Verify MONGODB_URI in `.env`
3. Check firewall settings

### OpenAI API Error

**Problem:** OpenAI API calls failing

**Solution:**
1. Verify API key in `.env`
2. Check API key has sufficient credits
3. Verify network connectivity

### Port Already in Use

**Problem:** Port 5000 is already in use

**Solution:**
Change PORT in `.env` to another port (e.g., 5001)

## Next Steps

1. **Read API Documentation**: See `API_DOCS.md`
2. **Configure Frontend**: Update frontend to use backend URL
3. **Run Tests**: `npm test`
4. **Deploy**: See `DEPLOYMENT.md`

## Development Tips

### Enable Debug Logging

```env
LOG_LEVEL=debug
```

### Use MongoDB Compass

Connect to: `mongodb://localhost:27017/interview-coach`

### Test with Postman

Import the API collection from `postman_collection.json` (if available)

### Watch Mode for Tests

```bash
npm run test:watch
```

## Support

For issues and questions:
- Check `README.md` for detailed documentation
- See `API_DOCS.md` for API reference
- Review logs in `logs/` directory
