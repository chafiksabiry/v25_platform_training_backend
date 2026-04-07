# Quick Start Guide - Training Platform API (Node.js)

## Prerequisites

- Node.js 18+ installed
- MongoDB instance (local or cloud)
- npm or yarn package manager

## 5-Minute Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment




Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and set your MongoDB connection:

```env
MONGODB_URI=mongodb://localhost:27017/training-platform
# OR for cloud MongoDB
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/
DB_NAME=harx

JWT_SECRET=your-random-secret-key-change-this
```

### 3. Build and Run

**Development Mode** (with auto-reload):
```bash
npm run dev
```

**Production Mode**:
```bash
npm run build
npm start
```

### 4. Test the API

The server starts on port 5010 by default.

**Health Check**:
```bash
curl http://localhost:5010/health
```

**Register a User**:
```bash
curl -X POST http://localhost:5010/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "password123",
    "role": "trainer"
  }'
```

**Login**:
```bash
curl -X POST http://localhost:5010/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

Save the token from the response and use it for authenticated requests:

```bash
curl -X GET http://localhost:5010/api/journeys \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## Project Structure Overview

```
src/
├── models/          # MongoDB schemas (User, TrainingJourney, etc.)
├── services/        # Business logic
├── controllers/     # Request handlers
├── routes/          # API routes
├── middleware/      # Auth, validation, error handling
├── config/          # Database configuration
├── app.ts           # Express app setup
└── server.ts        # Entry point
```

## Key Features Implemented

✅ User authentication with JWT
✅ Training journey CRUD operations
✅ MongoDB with Mongoose ODM
✅ TypeScript for type safety
✅ Input validation
✅ Error handling
✅ CORS support
✅ File upload support (Multer + Cloudinary)
✅ AI integration (OpenAI)
✅ Document parsing (PDF, Word)

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Run development server with auto-reload |
| `npm run build` | Compile TypeScript to JavaScript |
| `npm start` | Run production server |
| `npm run lint` | Lint code with ESLint |
| `npm test` | Run tests |

## Environment Variables

Required:
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - Secret for JWT tokens

Optional:
- `PORT` - Server port (default: 5010)
- `NODE_ENV` - Environment (development/production)
- `CORS_ORIGIN` - Allowed CORS origins
- `OPENAI_API_KEY` - For AI features
- `CLOUDINARY_*` - For file uploads

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create new user
- `POST /api/auth/login` - Login and get JWT token
- `GET /api/auth/me` - Get current user info
- `POST /api/auth/logout` - Logout

### Training Journeys
- `GET /api/journeys` - List all journeys
- `POST /api/journeys` - Create new journey
- `GET /api/journeys/:id` - Get journey details
- `PUT /api/journeys/:id` - Update journey
- `DELETE /api/journeys/:id` - Delete journey
- `POST /api/journeys/:id/launch` - Launch journey
- `GET /api/journeys/dashboard` - Trainer dashboard

### Health
- `GET /health` - Health check
- `GET /cors-test` - CORS test

## Troubleshooting

### MongoDB Connection Error
```
Error: Failed to connect to MongoDB
```
**Solution**: Check your `MONGODB_URI` in `.env` file. Make sure MongoDB is running.

### Port Already in Use
```
Error: listen EADDRINUSE: address already in use :::5010
```
**Solution**: Change the `PORT` in `.env` file or kill the process using port 5010.

### TypeScript Build Error
```
Solution**: Run `npm install` to ensure all dependencies are installed.

### Missing Environment Variables
```
Error: MONGODB_URI is not defined
```
**Solution**: Make sure you have a `.env` file with all required variables.

## Next Steps

1. **Configure External Services**:
   - Set up Cloudinary for file uploads
   - Add OpenAI API key for AI features
   - Configure ElevenLabs for voice generation (optional)

2. **Customize**:
   - Update CORS origins for your frontend
   - Adjust JWT expiration time
   - Configure file upload limits

3. **Deploy**:
   - Use PM2 for process management
   - Set up nginx as reverse proxy
   - Enable HTTPS with Let's Encrypt
   - Use environment-specific `.env` files

4. **Monitor**:
   - Add logging with Winston/Pino
   - Set up error tracking (Sentry)
   - Monitor performance (New Relic)

## Docker Quick Start

Build and run with Docker:

```bash
docker build -t training-platform .
docker run -p 5010:5010 --env-file .env training-platform
```

Or use Docker Compose:

```bash
docker-compose up
```

## Support

For detailed documentation, see:
- [README_NODEJS.md](./README_NODEJS.md) - Full documentation
- [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) - Migration from Java

For issues, create a GitHub issue or contact the development team.

---

**You're all set!** The API is now running and ready to accept requests. 🚀
