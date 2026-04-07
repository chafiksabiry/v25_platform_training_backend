# Training Platform API - Node.js Edition

AI-Powered Training Platform Backend built with Node.js, Express, TypeScript, and MongoDB.

## Features

- User authentication and authorization (JWT-based)
- Training journey management with embedded modules, sections, and quizzes
- AI-powered content generation using OpenAI
- Document parsing (PDF, Word)
- File uploads with Cloudinary integration
- Progress tracking for trainees
- Trainer dashboard with analytics
- RESTful API design
- TypeScript for type safety
- MongoDB with Mongoose ODM

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: MongoDB
- **ODM**: Mongoose
- **Authentication**: JWT (jsonwebtoken)
- **Password Hashing**: bcryptjs
- **File Upload**: Multer + Cloudinary
- **AI Integration**: OpenAI API
- **Document Parsing**: pdf-parse, mammoth
- **Validation**: express-validator
- **Security**: Helmet, CORS

## Project Structure

```
src/
├── config/
│   └── database.ts              # MongoDB connection
├── controllers/
│   ├── authController.ts        # Authentication handlers
│   ├── journeyController.ts     # Journey CRUD handlers
│   └── healthController.ts      # Health check handlers
├── middleware/
│   ├── auth.ts                  # JWT authentication & authorization
│   ├── errorHandler.ts          # Global error handling
│   ├── validator.ts             # Request validation
│   └── upload.ts                # File upload configuration
├── models/
│   ├── User.ts                  # User schema
│   ├── Rep.ts                   # Rep (trainee) schema
│   ├── TrainingJourney.ts       # Journey schema with embedded modules
│   ├── RepProgress.ts           # Progress tracking schema
│   ├── Company.ts               # Company schema
│   ├── Gig.ts                   # Gig schema
│   └── Industry.ts              # Industry schema
├── routes/
│   ├── authRoutes.ts            # Auth endpoints
│   ├── journeyRoutes.ts         # Journey endpoints
│   └── healthRoutes.ts          # Health endpoints
├── services/
│   ├── authService.ts           # Authentication business logic
│   ├── trainingJourneyService.ts # Journey business logic
│   ├── aiService.ts             # OpenAI integration
│   ├── cloudinaryService.ts     # File upload service
│   ├── documentParserService.ts # PDF/Word parsing
│   └── urlContentExtractor.ts   # Web scraping utility
├── app.ts                       # Express app configuration
└── server.ts                    # Server entry point
```

## Installation

### Prerequisites

- Node.js 18+ and npm 9+
- MongoDB instance (local or cloud)
- OpenAI API key (for AI features)
- Cloudinary account (for file uploads)

### Steps

1. **Clone the repository**
```bash
git clone <repository-url>
cd training-platform-api
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
NODE_ENV=development
PORT=5010

MONGODB_URI=mongodb://host:port/database
DB_NAME=harx

JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRATION=86400000

CORS_ORIGIN=http://localhost:3000

OPENAI_API_KEY=your-openai-api-key
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

4. **Build the project**
```bash
npm run build
```

5. **Run in development mode**
```bash
npm run dev
```

6. **Run in production mode**
```bash
npm start
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user (authenticated)
- `POST /api/auth/logout` - Logout user (authenticated)

### Training Journeys
- `GET /api/journeys` - Get all journeys (authenticated)
- `POST /api/journeys` - Create journey (trainer/admin only)
- `GET /api/journeys/:id` - Get journey by ID
- `PUT /api/journeys/:id` - Update journey (trainer/admin only)
- `DELETE /api/journeys/:id` - Delete journey (trainer/admin only)
- `POST /api/journeys/:id/launch` - Launch journey (trainer/admin only)
- `PATCH /api/journeys/:id/archive` - Archive journey (trainer/admin only)
- `GET /api/journeys/status/:status` - Get journeys by status
- `GET /api/journeys/dashboard` - Get trainer dashboard (trainer/admin only)

### Health Check
- `GET /health` - Health check endpoint
- `GET /cors-test` - CORS test endpoint

## Authentication

The API uses JWT (JSON Web Tokens) for authentication.

### Registration
```bash
curl -X POST http://localhost:5010/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "password123",
    "role": "trainee",
    "department": "Sales"
  }'
```

### Login
```bash
curl -X POST http://localhost:5010/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "password123"
  }'
```

### Using the Token
```bash
curl -X GET http://localhost:5010/api/journeys \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Data Models

### User
```typescript
{
  name: string;
  email: string;
  password: string;
  role: 'trainee' | 'trainer' | 'admin' | 'rep';
  department?: string;
  skills?: string[];
  learningStyle: 'visual' | 'auditory' | 'kinesthetic' | 'reading';
  aiPersonalityProfile?: object;
}
```

### Training Journey
```typescript
{
  companyId?: string;
  gigId?: string;
  industry?: string;
  name: string;
  title: string;
  description?: string;
  status: 'draft' | 'rehearsal' | 'active' | 'completed' | 'archived';
  modules: TrainingModule[];
  finalExam?: FinalExam;
  enrolledRepIds?: string[];
  launchDate?: Date;
}
```

## Development

### Run with auto-reload
```bash
npm run dev
```

### Build TypeScript
```bash
npm run build
```

### Lint code
```bash
npm run lint
```

### Run tests
```bash
npm test
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment (development/production) | development |
| `PORT` | Server port | 5010 |
| `MONGODB_URI` | MongoDB connection string | - |
| `DB_NAME` | Database name | harx |
| `JWT_SECRET` | Secret key for JWT | mySecretKey |
| `JWT_EXPIRATION` | Token expiration in ms | 86400000 |
| `CORS_ORIGIN` | Allowed CORS origins (comma-separated) | * |
| `OPENAI_API_KEY` | OpenAI API key | - |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name | - |
| `CLOUDINARY_API_KEY` | Cloudinary API key | - |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | - |

## Docker Support

Build and run with Docker:

```bash
docker build -t training-platform-api .
docker run -p 5010:5010 --env-file .env training-platform-api
```

Or use Docker Compose:

```bash
docker-compose up
```

## Error Handling

The API uses a centralized error handling middleware. All errors are caught and returned in a consistent format:

```json
{
  "status": "error",
  "message": "Error description"
}
```

HTTP Status Codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error

## Security Best Practices

1. **Authentication**: JWT tokens with secure secret
2. **Password Hashing**: bcrypt with salt rounds
3. **CORS**: Configurable allowed origins
4. **Helmet**: Security headers
5. **Input Validation**: express-validator
6. **Rate Limiting**: Recommended for production
7. **HTTPS**: Use reverse proxy (nginx) in production

## Performance Optimization

1. **Compression**: Response compression enabled
2. **Connection Pooling**: Mongoose handles automatically
3. **Indexing**: Database indexes on frequently queried fields
4. **Async/Await**: Non-blocking I/O operations
5. **Caching**: Consider adding Redis for sessions

## Migration from Java

See [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) for detailed migration documentation from the Java Spring Boot version.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

ISC

## Support

For issues and questions, please create an issue in the repository.
