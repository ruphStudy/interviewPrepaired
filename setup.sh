#!/bin/bash

# AI Interview Coach - Setup Script
# Run this to quickly setup the application

set -e  # Exit on error

echo "🚀 AI Interview Coach - Quick Setup"
echo "===================================="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+ first."
    echo "   Download from: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js version: $(node --version)"

# Check npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm not found. Please install npm."
    exit 1
fi

echo "✅ npm version: $(npm --version)"
echo ""

# Check MongoDB
echo "Checking MongoDB..."
if command -v mongosh &> /dev/null || command -v mongo &> /dev/null; then
    echo "✅ MongoDB found"
else
    echo "⚠️  MongoDB not found locally"
    echo "   Option 1: Install locally - brew install mongodb-community"
    echo "   Option 2: Use MongoDB Atlas (cloud) - https://www.mongodb.com/cloud/atlas"
    read -p "   Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi
echo ""

# Setup Backend
echo "📦 Setting up Backend..."
echo "========================"
cd backend

if [ ! -f "package.json" ]; then
    echo "❌ package.json not found in backend/"
    exit 1
fi

echo "Installing backend dependencies..."
npm install

if [ ! -f ".env" ]; then
    echo "Creating .env file from .env.example..."
    cp .env.example .env
    echo "⚠️  IMPORTANT: Edit backend/.env and add:"
    echo "   - MONGODB_URI (your MongoDB connection string)"
    echo "   - JWT_SECRET (random string, min 32 characters)"
    echo "   - OPENAI_API_KEY (from https://platform.openai.com/api-keys)"
    echo ""
    read -p "Press Enter to open .env file for editing..."
    ${EDITOR:-nano} .env
else
    echo "✅ .env file already exists"
fi

cd ..
echo ""

# Setup Frontend
echo "📦 Setting up Frontend..."
echo "========================"
cd frontend

if [ ! -f "package.json" ]; then
    echo "❌ package.json not found in frontend/"
    exit 1
fi

echo "Installing frontend dependencies..."
npm install

if [ ! -f ".env" ]; then
    echo "Creating .env file from .env.example..."
    cp .env.example .env
    echo "✅ Frontend .env created (defaults are fine for local dev)"
else
    echo "✅ .env file already exists"
fi

cd ..
echo ""

# Summary
echo "✅ Setup Complete!"
echo "=================="
echo ""
echo "Next steps:"
echo ""
echo "1. Ensure MongoDB is running:"
echo "   brew services start mongodb-community  # macOS"
echo "   # OR use MongoDB Atlas"
echo ""
echo "2. Start Backend (in one terminal):"
echo "   cd backend && npm run dev"
echo ""
echo "3. Start Frontend (in another terminal):"
echo "   cd frontend && npm run dev"
echo ""
echo "4. Open browser:"
echo "   http://localhost:5173"
echo ""
echo "⚠️  Remember to configure these in backend/.env:"
echo "   - MONGODB_URI"
echo "   - JWT_SECRET"
echo "   - OPENAI_API_KEY"
echo ""
echo "📚 For detailed instructions, see QUICKSTART.md"
echo ""
echo "Happy interviewing! 🎤"
