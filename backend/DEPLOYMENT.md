# Deployment Guide

Production deployment guide for AI Voice Interview Coach backend.

## Deployment Options

1. Docker (Recommended)
2. Cloud Platforms (AWS, GCP, Azure)
3. Platform-as-a-Service (Heroku, Railway, Render)
4. Virtual Private Server (DigitalOcean, Linode)

---

## Option 1: Docker Deployment

### Prerequisites

- Docker 20+
- Docker Compose 2+

### Step 1: Build Image

```bash
docker build -t interview-coach-backend .
```

### Step 2: Run with Docker Compose

```bash
# Create .env file with production values
cp .env.example .env

# Start all services
docker-compose up -d

# Check logs
docker-compose logs -f backend

# Stop services
docker-compose down
```

### Step 3: Verify Deployment

```bash
curl http://localhost:5000/health
```

---

## Option 2: AWS Deployment

### EC2 Deployment

**Step 1: Launch EC2 Instance**

- AMI: Ubuntu 22.04 LTS
- Instance Type: t3.small or larger
- Security Group: Allow ports 22 (SSH), 5000 (API), 27017 (MongoDB)

**Step 2: Connect and Setup**

```bash
# SSH into instance
ssh -i your-key.pem ubuntu@your-instance-ip

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install MongoDB
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update
sudo apt install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod

# Clone repository
git clone <your-repo-url>
cd interview-coach-backend

# Install dependencies
npm ci --only=production

# Setup environment
cp .env.example .env
nano .env  # Edit with production values

# Build
npm run build

# Install PM2
sudo npm install -g pm2

# Start application
pm2 start dist/server.js --name interview-coach

# Setup auto-restart
pm2 startup
pm2 save
```

**Step 3: Configure Nginx (Optional)**

```bash
sudo apt install -y nginx

# Create Nginx config
sudo nano /etc/nginx/sites-available/interview-coach
```

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/interview-coach /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

**Step 4: Setup SSL with Let's Encrypt**

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### AWS Elastic Beanstalk

**Step 1: Install EB CLI**

```bash
pip install awsebcli
```

**Step 2: Initialize**

```bash
eb init -p node.js-18 interview-coach-backend
```

**Step 3: Create Environment**

```bash
eb create production
```

**Step 4: Deploy**

```bash
eb deploy
```

---

## Option 3: Heroku Deployment

### Step 1: Install Heroku CLI

```bash
npm install -g heroku
heroku login
```

### Step 2: Create App

```bash
heroku create interview-coach-backend
```

### Step 3: Add MongoDB

```bash
heroku addons:create mongolab:sandbox
```

### Step 4: Set Environment Variables

```bash
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=your-secret-key
heroku config:set OPENAI_API_KEY=your-api-key
heroku config:set CORS_ORIGIN=https://your-frontend.com
```

### Step 5: Deploy

```bash
git push heroku main
```

### Step 6: Verify

```bash
heroku open /health
heroku logs --tail
```

---

## Option 4: Railway Deployment

### Step 1: Connect Repository

1. Go to [Railway.app](https://railway.app)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Connect your repository

### Step 2: Add MongoDB

1. Click "+ New"
2. Select "Database"
3. Choose "MongoDB"

### Step 3: Configure Environment

Add variables:
- `NODE_ENV=production`
- `JWT_SECRET=your-secret-key`
- `OPENAI_API_KEY=your-api-key`
- `MONGODB_URI=${{MongoDB.MONGO_URL}}`

### Step 4: Deploy

Railway auto-deploys on git push.

---

## Production Checklist

### Security

- [ ] Use strong JWT_SECRET (minimum 32 characters)
- [ ] Enable HTTPS/SSL
- [ ] Set secure CORS_ORIGIN
- [ ] Use environment variables (never commit secrets)
- [ ] Enable rate limiting
- [ ] Set up firewall rules
- [ ] Use MongoDB authentication
- [ ] Enable MongoDB encryption at rest
- [ ] Set up API key rotation
- [ ] Configure Content Security Policy

### Performance

- [ ] Enable compression
- [ ] Set up MongoDB indexes
- [ ] Configure connection pooling
- [ ] Enable response caching
- [ ] Set up CDN (if applicable)
- [ ] Monitor memory usage
- [ ] Optimize database queries

### Monitoring

- [ ] Set up application logging (Winston)
- [ ] Configure error tracking (Sentry, Bugsnag)
- [ ] Set up uptime monitoring
- [ ] Monitor API response times
- [ ] Track OpenAI API costs
- [ ] Set up alerts for errors
- [ ] Monitor database performance

### Backup

- [ ] Set up automated MongoDB backups
- [ ] Test restore procedures
- [ ] Store backups in separate location
- [ ] Document recovery process

### CI/CD

- [ ] Set up GitHub Actions or equivalent
- [ ] Run tests on every push
- [ ] Automated deployment on merge
- [ ] Run linting and formatting checks

---

## Environment Variables Reference

```env
# Required
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb://...
JWT_SECRET=your-secret-key
OPENAI_API_KEY=sk-...
CORS_ORIGIN=https://your-frontend.com

# Optional
MONGODB_URI_PROD=mongodb+srv://...
JWT_EXPIRE=7d
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
LOG_LEVEL=info
LOG_FILE=logs/app.log
```

---

## Monitoring and Logs

### PM2 Logs

```bash
pm2 logs interview-coach
pm2 monit
```

### Application Logs

```bash
tail -f logs/combined.log
tail -f logs/error.log
```

### MongoDB Logs

```bash
sudo tail -f /var/log/mongodb/mongod.log
```

---

## Scaling

### Horizontal Scaling

1. Set up load balancer (AWS ALB, Nginx)
2. Deploy multiple instances
3. Use MongoDB Atlas for shared database
4. Configure session store (Redis)

### Vertical Scaling

- Increase server resources (CPU, RAM)
- Optimize database queries
- Add caching layer

---

## Troubleshooting

### High Memory Usage

```bash
# Check memory
free -h
pm2 monit

# Restart if needed
pm2 restart interview-coach
```

### Database Connection Issues

```bash
# Check MongoDB status
sudo systemctl status mongod

# Restart MongoDB
sudo systemctl restart mongod

# Check connections
mongo --eval "db.serverStatus().connections"
```

### High API Costs

- Review OpenAI usage logs
- Implement request caching
- Use cheaper models where appropriate
- Set usage limits

---

## Maintenance

### Update Dependencies

```bash
npm outdated
npm update
npm audit fix
```

### Database Maintenance

```bash
# Compact database
mongo interview-coach --eval "db.runCommand({compact: 'interviews'})"

# Rebuild indexes
mongo interview-coach --eval "db.interviews.reIndex()"
```

### Backup

```bash
# Manual backup
mongodump --db interview-coach --out backup/

# Restore
mongorestore --db interview-coach backup/interview-coach/
```

---

## Support

For deployment issues:
1. Check logs: `pm2 logs` or `heroku logs --tail`
2. Verify environment variables
3. Test database connectivity
4. Review security group/firewall rules
