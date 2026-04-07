# Architecture Documentation - Training Platform API (Node.js)

## System Architecture

### High-Level Overview

```
┌─────────────────┐
│   Frontend      │
│  (React/Vue)    │
└────────┬────────┘
         │ HTTP/REST
         │
┌────────▼────────────────────────────────────────┐
│           Express.js API Server                 │
│  ┌──────────────────────────────────────────┐  │
│  │         Middleware Layer                  │  │
│  │  - CORS                                   │  │
│  │  - Authentication (JWT)                   │  │
│  │  - Validation                             │  │
│  │  - Error Handling                         │  │
│  └──────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────┐  │
│  │         Routes Layer                      │  │
│  │  - Auth Routes                            │  │
│  │  - Journey Routes                         │  │
│  │  - Health Routes                          │  │
│  └──────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────┐  │
│  │       Controllers Layer                   │  │
│  │  - Request Handling                       │  │
│  │  - Response Formatting                    │  │
│  └──────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────┐  │
│  │        Services Layer                     │  │
│  │  - Business Logic                         │  │
│  │  - Data Validation                        │  │
│  │  - External API Calls                     │  │
│  └──────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────┐  │
│  │         Data Layer                        │  │
│  │  - Mongoose Models                        │  │
│  │  - Database Queries                       │  │
│  └──────────────────────────────────────────┘  │
└────────┬────────────────────────────────────────┘
         │
┌────────▼────────┐    ┌─────────────┐    ┌──────────────┐
│    MongoDB      │    │   OpenAI    │    │  Cloudinary  │
│   Database      │    │     API     │    │  File Storage│
└─────────────────┘    └─────────────┘    └──────────────┘
```

## Layered Architecture

### 1. Presentation Layer (Routes & Controllers)

**Responsibilities**:
- Handle HTTP requests/responses
- Route mapping
- Input validation
- Authentication checks
- Response formatting

**Files**:
- `src/routes/*.ts` - Route definitions
- `src/controllers/*.ts` - Request handlers

**Example Flow**:
```typescript
POST /api/auth/login
  → authRoutes.ts (route definition)
  → loginValidation middleware (validation)
  → authController.login (handler)
  → response to client
```

### 2. Business Logic Layer (Services)

**Responsibilities**:
- Core business logic
- Data processing
- External service integration
- Business rules enforcement

**Files**:
- `src/services/authService.ts` - Authentication logic
- `src/services/trainingJourneyService.ts` - Journey management
- `src/services/aiService.ts` - AI integration
- `src/services/cloudinaryService.ts` - File uploads

**Example**:
```typescript
class AuthService {
  async login(loginData): Promise<AuthResponse> {
    // 1. Find user
    // 2. Verify password
    // 3. Generate JWT token
    // 4. Return response
  }
}
```

### 3. Data Access Layer (Models)

**Responsibilities**:
- Database schema definition
- Data validation rules
- Database queries
- Index management

**Files**:
- `src/models/*.ts` - Mongoose schemas

**Example**:
```typescript
const userSchema = new Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ['trainee', 'trainer', 'admin'] }
}, { timestamps: true });
```

### 4. Middleware Layer

**Responsibilities**:
- Request preprocessing
- Authentication
- Authorization
- Validation
- Error handling
- Logging

**Files**:
- `src/middleware/auth.ts` - JWT authentication
- `src/middleware/errorHandler.ts` - Error handling
- `src/middleware/validator.ts` - Input validation
- `src/middleware/upload.ts` - File upload handling

## Data Flow

### Request Flow (Authenticated Endpoint)

```
Client Request
    ↓
CORS Middleware
    ↓
Body Parser
    ↓
Route Matcher
    ↓
Authentication Middleware (JWT verification)
    ↓
Authorization Middleware (role check)
    ↓
Validation Middleware
    ↓
Controller (request handling)
    ↓
Service (business logic)
    ↓
Model (database query)
    ↓
Database
    ↓
Model (result mapping)
    ↓
Service (data processing)
    ↓
Controller (response formatting)
    ↓
Response to Client
```

### Error Handling Flow

```
Error Occurs
    ↓
Throw AppError or standard Error
    ↓
Caught by asyncHandler wrapper
    ↓
Passed to Error Middleware
    ↓
Error formatted
    ↓
HTTP Response with error details
```

## Database Schema Design

### Core Collections

#### 1. Users Collection
```javascript
{
  _id: ObjectId,
  name: String,
  email: String (unique, indexed),
  password: String (hashed, not selected by default),
  role: String (enum),
  department: String,
  skills: [String],
  learningStyle: String,
  aiPersonalityProfile: Object,
  createdAt: Date,
  updatedAt: Date
}
```

#### 2. Reps Collection
```javascript
{
  _id: ObjectId,
  userId: String (ref: User),
  name: String,
  email: String,
  role: String,
  companyId: String (ref: Company),
  gigId: String (ref: Gig),
  createdAt: Date,
  updatedAt: Date
}
```

#### 3. Training Journeys Collection (Embedded Design)
```javascript
{
  _id: ObjectId,
  companyId: String (ref: Company),
  gigId: String (ref: Gig),
  title: String,
  description: String,
  status: String (enum),
  modules: [                          // Embedded documents
    {
      _id: String (ObjectId),
      title: String,
      description: String,
      sections: [                     // Nested embedded
        {
          _id: String,
          title: String,
          content: String,
          type: String
        }
      ],
      quizzes: [                      // Nested embedded
        {
          _id: String,
          title: String,
          questions: [                // Deeply nested
            {
              _id: String,
              question: String,
              options: [String],
              correctAnswer: Number
            }
          ]
        }
      ]
    }
  ],
  finalExam: {                        // Embedded document
    _id: String,
    title: String,
    questions: [...]
  },
  enrolledRepIds: [String],           // References to Reps
  createdAt: Date,
  updatedAt: Date
}
```

#### 4. Rep Progress Collection
```javascript
{
  _id: ObjectId,
  repId: String (ref: Rep),
  journeyId: String (ref: TrainingJourney),
  moduleTotal: Number,
  moduleFinished: Number,
  moduleInProgress: Number,
  modules: Map<String, ModuleProgress>,  // Map structure
  engagementScore: Number,
  lastAccessed: Date,
  finalExamScore: Number,
  completedAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

### Relationship Patterns

**1. One-to-Many (Reference)**
- User → Rep (one user can have one rep profile)
- Company → Journeys (one company has many journeys)

**2. Embedded Documents**
- Journey → Modules → Sections → Content
- Journey → Modules → Quizzes → Questions

**3. Array of References**
- Journey → enrolledRepIds (many reps in one journey)

### Indexing Strategy

```javascript
// User model
userSchema.index({ email: 1 });

// TrainingJourney model
trainingJourneySchema.index({ companyId: 1 });
trainingJourneySchema.index({ gigId: 1 });
trainingJourneySchema.index({ status: 1 });
trainingJourneySchema.index({ industry: 1 });

// RepProgress model
repProgressSchema.index({ repId: 1, journeyId: 1 }, { unique: true });
repProgressSchema.index({ repId: 1 });
repProgressSchema.index({ journeyId: 1 });
```

## Security Architecture

### Authentication Flow

```
1. User Registration
   → Hash password with bcrypt
   → Store user in database
   → Generate JWT token
   → Return token to client

2. User Login
   → Verify email exists
   → Compare password hash
   → Generate JWT token
   → Return token to client

3. Authenticated Request
   → Client sends JWT in Authorization header
   → Middleware verifies JWT
   → Extract user info from token
   → Attach to request object
   → Proceed to controller
```

### JWT Token Structure

```javascript
{
  header: {
    alg: "HS256",
    typ: "JWT"
  },
  payload: {
    id: "user_id",
    email: "user@example.com",
    role: "trainer",
    iat: 1234567890,
    exp: 1234654290
  },
  signature: "..."
}
```

### Security Layers

1. **CORS**: Cross-origin request protection
2. **Helmet**: Security headers
3. **JWT**: Stateless authentication
4. **bcrypt**: Password hashing (10 rounds)
5. **express-validator**: Input sanitization
6. **Rate Limiting**: (Recommended for production)

## API Design Patterns

### RESTful Conventions

| HTTP Method | Endpoint | Purpose |
|-------------|----------|---------|
| GET | /api/resource | List all resources |
| POST | /api/resource | Create new resource |
| GET | /api/resource/:id | Get specific resource |
| PUT | /api/resource/:id | Update resource (full) |
| PATCH | /api/resource/:id | Update resource (partial) |
| DELETE | /api/resource/:id | Delete resource |

### Response Format

**Success Response**:
```json
{
  "data": { ... },
  "message": "Success message"
}
```

**Error Response**:
```json
{
  "status": "error",
  "message": "Error description"
}
```

**List Response**:
```json
[
  { "id": 1, ... },
  { "id": 2, ... }
]
```

### Status Codes

- `200 OK` - Successful GET, PUT, PATCH
- `201 Created` - Successful POST
- `204 No Content` - Successful DELETE
- `400 Bad Request` - Validation error
- `401 Unauthorized` - Missing/invalid token
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error

## External Service Integration

### 1. OpenAI API
```typescript
class AIService {
  async generateTrainingContent(prompt: string): Promise<string> {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [...]
    });
    return response.choices[0].message.content;
  }
}
```

### 2. Cloudinary
```typescript
class CloudinaryService {
  async uploadImage(file: File): Promise<{ url: string }> {
    const result = await cloudinary.uploader.upload(file.path);
    return { url: result.secure_url };
  }
}
```

## Performance Considerations

### 1. Database Optimization
- Indexed fields for frequent queries
- Embedded documents for related data
- Selective field projection
- Connection pooling (automatic with Mongoose)

### 2. Application Level
- Async/await for non-blocking I/O
- Response compression
- Static file caching
- Environment-based logging

### 3. Recommended Additions
- Redis for session storage
- Rate limiting for API protection
- Response caching for frequent queries
- Database query profiling

## Scalability

### Horizontal Scaling
- Stateless JWT authentication (no session storage)
- Multiple app instances behind load balancer
- MongoDB replica sets for database scaling

### Vertical Scaling
- Node.js cluster mode
- Worker threads for CPU-intensive tasks
- PM2 process manager

## Monitoring & Logging

### Recommended Tools
- **Logging**: Winston, Pino
- **Error Tracking**: Sentry
- **Performance**: New Relic, Datadog
- **Process Management**: PM2
- **Health Checks**: Built-in `/health` endpoint

### Log Levels
- `error` - Critical errors
- `warn` - Warning messages
- `info` - General information
- `debug` - Development debugging

## Deployment Architecture

### Production Setup

```
Internet
    ↓
Load Balancer (nginx)
    ↓
┌─────────────────────────────┐
│  App Instance 1 (PM2)       │
│  App Instance 2 (PM2)       │
│  App Instance 3 (PM2)       │
└─────────────────────────────┘
    ↓
MongoDB Replica Set
    ↓
Backups & Monitoring
```

## Comparison: Java vs Node.js Architecture

| Aspect | Java Spring Boot | Node.js/Express |
|--------|------------------|-----------------|
| Architecture | Annotation-based DI | Functional/Class-based |
| Concurrency | Multi-threaded | Event loop (single-threaded) |
| Dependency Management | Maven/Gradle | npm |
| Configuration | application.yml | .env files |
| ORM/ODM | Spring Data MongoDB | Mongoose |
| Middleware | Filter chains | Express middleware |
| Error Handling | @ControllerAdvice | Error middleware |
| Validation | Jakarta Validation | express-validator |

## Best Practices Applied

1. **Separation of Concerns**: Clear layer separation
2. **DRY Principle**: Reusable services and middleware
3. **Error Handling**: Centralized error management
4. **Security**: JWT, password hashing, input validation
5. **Type Safety**: TypeScript for compile-time checks
6. **Async Operations**: Proper async/await usage
7. **Database Design**: Appropriate use of embedded vs referenced documents
8. **API Conventions**: RESTful design patterns
9. **Environment Configuration**: Secure environment variable management
10. **Documentation**: Comprehensive inline and external documentation

---

This architecture provides a solid foundation for a scalable, maintainable, and secure training platform API.
