# Java Spring Boot to Node.js Migration Guide

## Overview

This document provides a comprehensive guide for the migration from Java Spring Boot to Node.js/TypeScript with Express and MongoDB.

## Technology Mapping

| Java/Spring Boot | Node.js/Express |
|-----------------|-----------------|
| Spring Boot | Express.js |
| @RestController | Express Router + Controllers |
| @Service | Service Classes |
| @Repository (MongoDB) | Mongoose Models |
| @Entity/@Document | Mongoose Schema |
| Spring Security + JWT | jsonwebtoken + Custom Middleware |
| application.yml | .env + dotenv |
| Maven (pom.xml) | npm (package.json) |
| Lombok | TypeScript Interfaces |
| @Valid + Validation | express-validator |
| RestTemplate/WebClient | axios |
| MultipartFile | multer |

## Project Structure Comparison

### Java Spring Boot Structure
```
src/main/java/com/trainingplatform/
├── core/entities/              → Business entities
├── domain/entities/            → Domain models
├── domain/repositories/        → Repository interfaces
├── application/
│   ├── dto/                    → Data transfer objects
│   └── services/               → Business logic services
├── infrastructure/
│   ├── config/                 → Configuration
│   ├── repositories/           → Repository implementations
│   └── security/               → Security configuration
└── presentation/
    ├── controllers/            → REST endpoints
    └── dtos/                   → Response DTOs
```

### Node.js/TypeScript Structure
```
src/
├── models/                     → Mongoose schemas (entities)
├── services/                   → Business logic services
├── controllers/                → Request handlers
├── routes/                     → Route definitions
├── middleware/                 → Auth, validation, error handling
├── config/                     → Database and app configuration
├── app.ts                      → Express app setup
└── server.ts                   → Server entry point
```

## Key Conversions

### 1. Entity/Model Conversion

**Java (Spring Boot with MongoDB)**
```java
@Document(collection = "users")
public class User {
    @Id
    private String id;

    @NotBlank
    @Email
    @Indexed(unique = true)
    private String email;

    @NotBlank
    @Size(min = 8)
    private String password;

    @CreatedDate
    private LocalDateTime createdAt;
}
```

**Node.js/TypeScript (Mongoose)**
```typescript
const userSchema = new Schema<IUser>({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
  },
  password: {
    type: String,
    required: true,
    minlength: 8,
    select: false
  }
}, {
  timestamps: true
});
```

### 2. Controller Conversion

**Java (Spring Boot)**
```java
@RestController
@RequestMapping("/api/auth")
public class AuthController {
    @Autowired
    private AuthService authService;

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        AuthResponse response = authService.login(request);
        return ResponseEntity.ok(response);
    }
}
```

**Node.js/TypeScript (Express)**
```typescript
// Controller
export const login = asyncHandler(async (req: AuthRequest, res: Response) => {
  const response = await authService.login(req.body);
  res.status(200).json(response);
});

// Route
router.post('/login', loginValidation, authController.login);
```

### 3. Service Layer Conversion

**Java (Spring Boot)**
```java
@Service
public class AuthService {
    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    public AuthResponse login(LoginRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
            .orElseThrow(() -> new RuntimeException("User not found"));

        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new RuntimeException("Invalid password");
        }

        return new AuthResponse(token, user);
    }
}
```

**Node.js/TypeScript**
```typescript
class AuthService {
  async login(loginData: LoginRequest): Promise<AuthResponse> {
    const user = await User.findOne({ email: loginData.email }).select('+password');
    if (!user) {
      throw new AppError('Invalid email or password', 401);
    }

    const isPasswordValid = await bcrypt.compare(loginData.password, user.password);
    if (!isPasswordValid) {
      throw new AppError('Invalid email or password', 401);
    }

    const token = this.generateToken(user._id.toString(), user.email, user.role);
    return { token, user };
  }
}
```

### 4. Authentication/Security Conversion

**Java (Spring Security + JWT)**
```java
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {
    protected void doFilterInternal(HttpServletRequest request, ...) {
        String token = getJwtFromRequest(request);
        if (StringUtils.hasText(token) && jwtTokenProvider.validateToken(token)) {
            String userId = jwtTokenProvider.getUserIdFromJWT(token);
            // Set authentication
        }
    }
}
```

**Node.js/TypeScript (Custom Middleware)**
```typescript
export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ message: 'No token provided' });
    return;
  }

  const token = authHeader.substring(7);
  const decoded = jwt.verify(token, jwtSecret);
  req.user = decoded;
  next();
};
```

### 5. Validation Conversion

**Java (Jakarta Validation)**
```java
public class RegisterRequest {
    @NotBlank(message = "Name is required")
    @Size(min = 2, max = 100)
    private String name;

    @Email(message = "Email should be valid")
    @NotBlank
    private String email;
}
```

**Node.js/TypeScript (express-validator)**
```typescript
export const registerValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email'),
  validate
];
```

## Database Migration

### MongoDB Connection

**Java (Spring Boot)**
```yaml
spring:
  data:
    mongodb:
      uri: mongodb://host:port/database
      database: harx
```

**Node.js (Mongoose)**
```typescript
await mongoose.connect(mongoUri, {
  dbName: process.env.DB_NAME || 'harx'
});
```

### Key Differences

1. **ObjectId Handling**: In Java, ObjectIds are Strings. In Node.js, they're `mongoose.Types.ObjectId` but can be converted to strings.

2. **Embedded Documents**: Both support embedded documents, but Mongoose uses subdocuments with schemas.

3. **References**:
   - Java: Store as String (ObjectId as hex string)
   - Node.js: Use `Schema.Types.ObjectId` with `ref` option

## Configuration Migration

### Environment Variables

**Java (application.yml)**
```yaml
app:
  jwt:
    secret: ${JWT_SECRET:mySecretKey}
    expiration: ${JWT_EXPIRATION:86400000}
```

**Node.js (.env)**
```
JWT_SECRET=mySecretKey
JWT_EXPIRATION=86400000
```

## Error Handling

### Java (Spring Boot)
```java
@ControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleException(Exception ex) {
        return new ResponseEntity<>(new ErrorResponse(ex.getMessage()), HttpStatus.INTERNAL_SERVER_ERROR);
    }
}
```

### Node.js (Express)
```typescript
export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ status: 'error', message: err.message });
    return;
  }
  res.status(500).json({ status: 'error', message: 'Internal server error' });
};
```

## Installation Steps

1. **Install Dependencies**
```bash
npm install
```

2. **Setup Environment Variables**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Build TypeScript**
```bash
npm run build
```

4. **Run Development Server**
```bash
npm run dev
```

5. **Run Production Server**
```bash
npm start
```

## API Endpoints (Unchanged)

All REST endpoints remain the same:

- `POST /api/auth/login`
- `POST /api/auth/register`
- `GET /api/auth/me`
- `GET /api/journeys`
- `POST /api/journeys`
- `PUT /api/journeys/:id`
- `DELETE /api/journeys/:id`

## Testing

The frontend should work without any changes since the API contract remains identical.

## Performance Improvements

1. **Async/Await**: All database operations use native async/await
2. **Connection Pooling**: Mongoose handles connection pooling automatically
3. **Middleware Pipeline**: Express middleware is more lightweight than Spring filters
4. **JSON Parsing**: Native JSON parsing is faster in Node.js

## Potential Issues & Solutions

### 1. Date Handling
**Issue**: Java uses `LocalDateTime`, Node.js uses JavaScript `Date`
**Solution**: Both serialize to ISO 8601 strings, compatible across systems

### 2. Password Encoding
**Issue**: Different hashing algorithms
**Solution**: Re-hash passwords on first login or during migration

### 3. File Upload Size Limits
**Issue**: Different configuration syntax
**Solution**: Use multer limits configuration

## Manual Migration Checklist

- [ ] Copy `.env.example` to `.env` and configure
- [ ] Update MongoDB connection string
- [ ] Configure Cloudinary credentials
- [ ] Set OpenAI API key
- [ ] Update CORS origins
- [ ] Install dependencies: `npm install`
- [ ] Build project: `npm run build`
- [ ] Run development server: `npm run dev`
- [ ] Test authentication endpoints
- [ ] Test journey CRUD operations
- [ ] Verify file uploads work
- [ ] Test AI integration

## Recommended Improvements

1. **Add Request Rate Limiting**: Use `express-rate-limit`
2. **Add API Documentation**: Use Swagger/OpenAPI
3. **Add Redis Caching**: For session management
4. **Add WebSocket Support**: For real-time features
5. **Add Unit Tests**: Using Jest
6. **Add Integration Tests**: Using Supertest
7. **Add Docker Support**: Already included
8. **Add CI/CD Pipeline**: GitHub Actions or similar
9. **Add Monitoring**: Use PM2 or New Relic
10. **Add Logging**: Use Winston or Pino

## Conclusion

This migration maintains 100% API compatibility while providing a more lightweight, performant Node.js solution. The async/await pattern in Node.js provides cleaner code compared to Java's CompletableFuture or reactive approaches.
