# Installation & Deployment Steps

## Prerequisites

Before you begin, ensure you have:

- ✅ Node.js 18+ installed (`node --version`)
- ✅ npm 9+ installed (`npm --version`)
- ✅ MongoDB instance (local or cloud)
- ✅ Git installed (optional)

## Step 1: Project Setup

### Option A: From Existing Code

```bash
cd /path/to/project
```

### Option B: Clone Repository (if applicable)


```bash
git clone <repository-url>
cd training-platform-api
```

## Step 2: Install Dependencies

```bash
npm install
```



This will install all required packages (~645 packages):
- Express.js - Web framework
- Mongoose - MongoDB ODM
- TypeScript - Type safety
- JWT, bcrypt - Authentication
- And many more...

**Expected time**: 1-2 minutes

## Step 3: Configure Environment

### Create Environment File

```bash
cp .env.example .env
```

### Edit .env File

Open `.env` in your editor and configure:

```env
# Server Configuration
NODE_ENV=development
PORT=5010

# Database Configuration (REQUIRED)
MONGODB_URI=mongodb://localhost:27017/training-platform
# OR for MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/
DB_NAME=harx

# Authentication (REQUIRED)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRATION=86400000

# CORS Configuration
CORS_ORIGIN=http://localhost:3000,https://your-frontend.vercel.app

# File Upload
UPLOAD_DIR=uploads
MAX_FILE_SIZE=524288000

# OpenAI Configuration (Optional - for AI features)
OPENAI_API_KEY=sk-your-openai-api-key
OPENAI_MODEL=gpt-4
OPENAI_TEMPERATURE=0.7
OPENAI_MAX_TOKENS=2000

# ElevenLabs Configuration (Optional - for voice)
ELEVENLABS_API_KEY=your-elevenlabs-api-key
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
ELEVENLABS_MODEL=eleven_monolingual_v1

# Cloudinary Configuration (Optional - for file uploads)
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
CLOUDINARY_PRESET_TRAINING_IMAGES=bf1katla
CLOUDINARY_PRESET_TRAINING_CONTENT=hio38iac
CLOUDINARY_PRESET_MOCKCALLS=kuecaxbp
```

### Minimum Required Configuration

For basic functionality, you only need:

```env
NODE_ENV=development
PORT=5010
MONGODB_URI=mongodb://localhost:27017/training-platform
DB_NAME=harx
JWT_SECRET=change-this-to-a-random-string
```

## Step 4: Build the Project

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` folder.

**Expected output**:
```
> training-platform-api@1.0.0 build
> tsc

(no errors = success)
```

**Expected time**: 5-10 seconds

## Step 5: Start the Server

### Development Mode (Recommended for Testing)

```bash
npm run dev
```

Features:
- Auto-reload on code changes
- Detailed error messages
- Debug logging enabled

**Expected output**:
```
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║     Training Platform API - Node.js Edition          ║
║                                                       ║
║     Server running on port 5010                      ║
║     Environment: development                         ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝

MongoDB connected successfully
```

### Production Mode

```bash
npm start
```

Features:
- Optimized performance
- Production logging
- No auto-reload

## Step 6: Verify Installation

### Test 1: Health Check

```bash
curl http://localhost:5010/health
```

**Expected response**:
```json
{
  "status": "OK",
  "timestamp": "2024-04-07T10:00:00.000Z",
  "uptime": 12.345,
  "database": "connected"
}
```

### Test 2: CORS Test

```bash
curl http://localhost:5010/cors-test
```

**Expected response**:
```json
{
  "message": "CORS is working",
  "method": "GET"
}
```

### Test 3: Register User

```bash
curl -X POST http://localhost:5010/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "password123",
    "role": "trainer",
    "department": "Engineering"
  }'
```

**Expected response**:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "...",
    "name": "Test User",
    "email": "test@example.com",
    "role": "trainer",
    "department": "Engineering"
  }
}
```

### Test 4: Login

```bash
curl -X POST http://localhost:5010/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

### Test 5: Protected Endpoint

Save the token from login/register, then:

```bash
curl -X GET http://localhost:5010/api/journeys \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**Expected response**: `[]` (empty array - no journeys yet)

## Common Issues & Solutions

### Issue 1: MongoDB Connection Error

**Error**:
```
Error: Failed to connect to MongoDB
MongooseServerSelectionError: connect ECONNREFUSED 127.0.0.1:27017
```

**Solutions**:

1. **Check MongoDB is running**:
   ```bash
   # macOS/Linux
   brew services start mongodb-community
   # OR
   sudo systemctl start mongod

   # Windows
   net start MongoDB
   ```

2. **Verify connection string**:
   ```env
   # Local MongoDB
   MONGODB_URI=mongodb://localhost:27017/training-platform

   # MongoDB Atlas (cloud)
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/
   ```

3. **Check MongoDB is accessible**:
   ```bash
   mongosh # or mongo
   ```

### Issue 2: Port Already in Use

**Error**:
```
Error: listen EADDRINUSE: address already in use :::5010
```

**Solutions**:

1. **Change port in .env**:
   ```env
   PORT=5011
   ```

2. **Kill process using port 5010**:
   ```bash
   # macOS/Linux
   lsof -ti:5010 | xargs kill -9

   # Windows
   netstat -ano | findstr :5010
   taskkill /PID <PID> /F
   ```

### Issue 3: TypeScript Build Errors

**Error**:
```
error TS2307: Cannot find module 'express'
```

**Solution**:
```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Issue 4: JWT Secret Not Set

**Error**:
```
Error: JWT_SECRET is not defined
```

**Solution**: Add to `.env`:
```env
JWT_SECRET=your-random-secret-key-min-32-chars
```

Generate a secure secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Issue 5: Missing Environment File

**Error**:
```
Error: ENOENT: no such file or directory, open '.env'
```

**Solution**:
```bash
cp .env.example .env
# Edit .env with your configuration
```

## Production Deployment

### Using PM2 (Recommended)

1. **Install PM2**:
   ```bash
   npm install -g pm2
   ```

2. **Start with PM2**:
   ```bash
   npm run build
   pm2 start dist/server.js --name training-api
   ```

3. **PM2 Commands**:
   ```bash
   pm2 status          # Check status
   pm2 logs            # View logs
   pm2 restart all     # Restart
   pm2 stop all        # Stop
   pm2 delete all      # Remove
   ```

4. **Auto-start on reboot**:
   ```bash
   pm2 startup
   pm2 save
   ```

### Using Docker

1. **Build Docker image**:
   ```bash
   docker build -t training-platform-api .
   ```

2. **Run container**:
   ```bash
   docker run -d \
     --name training-api \
     -p 5010:5010 \
     --env-file .env \
     training-platform-api
   ```

3. **Docker commands**:
   ```bash
   docker ps                      # List containers
   docker logs training-api       # View logs
   docker stop training-api       # Stop
   docker start training-api      # Start
   docker rm training-api         # Remove
   ```

### Using Docker Compose

1. **Start services**:
   ```bash
   docker-compose up -d
   ```

2. **View logs**:
   ```bash
   docker-compose logs -f
   ```

3. **Stop services**:
   ```bash
   docker-compose down
   ```

### Deploy to Cloud Platform

#### Heroku

```bash
heroku create training-platform-api
heroku config:set MONGODB_URI=your-mongodb-uri
heroku config:set JWT_SECRET=your-jwt-secret
git push heroku main
```

#### AWS EC2

1. SSH into EC2 instance
2. Install Node.js 18+
3. Clone repository
4. Follow installation steps above
5. Use PM2 for process management
6. Configure nginx as reverse proxy

#### DigitalOcean

Similar to AWS EC2, or use App Platform for easier deployment.

## Environment-Specific Configuration

### Development (.env.development)
```env
NODE_ENV=development
PORT=5010
MONGODB_URI=mongodb://localhost:27017/training-dev
```

### Staging (.env.staging)
```env
NODE_ENV=staging
PORT=5010
MONGODB_URI=mongodb+srv://...staging-cluster...
```

### Production (.env.production)
```env
NODE_ENV=production
PORT=5010
MONGODB_URI=mongodb+srv://...production-cluster...
```

## Post-Installation Steps

1. ✅ **Verify all endpoints** - Test each API endpoint
2. ✅ **Set up monitoring** - Add error tracking (Sentry)
3. ✅ **Configure backups** - Set up MongoDB backups
4. ✅ **Enable HTTPS** - Use Let's Encrypt or cloud SSL
5. ✅ **Add rate limiting** - Protect against abuse
6. ✅ **Set up CI/CD** - Automate deployments
7. ✅ **Update documentation** - Document your specific setup

## Useful Commands

```bash
# Development
npm run dev              # Start dev server
npm run build           # Build TypeScript
npm run lint            # Lint code

# Production
npm start               # Start production server
pm2 start dist/server.js # Start with PM2

# Debugging
npm run dev -- --inspect  # Enable Node.js debugger
DEBUG=* npm run dev       # Enable debug logging

# Database
mongosh                  # Connect to MongoDB
mongodump --db harx      # Backup database
mongorestore             # Restore database
```

## Next Steps

1. Read [README_NODEJS.md](./README_NODEJS.md) for complete documentation
2. Read [QUICKSTART.md](./QUICKSTART.md) for quick reference
3. Read [ARCHITECTURE.md](./ARCHITECTURE.md) for system design
4. Configure external services (OpenAI, Cloudinary)
5. Set up your frontend to connect to the API
6. Deploy to staging/production environment

## Getting Help

If you encounter issues:

1. Check [Common Issues](#common-issues--solutions) above
2. Review logs: `npm run dev` or `pm2 logs`
3. Check MongoDB connection: `mongosh`
4. Verify environment variables: `cat .env`
5. Check port availability: `lsof -i :5010`

---

**Installation Status**: Ready to deploy! 🚀
