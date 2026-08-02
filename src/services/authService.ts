import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import Rep from '../models/Rep';
import { AppError } from '../middleware/errorHandler';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  role?: string;
  department?: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    department?: string;
  };
  repProfile?: any;
}

class AuthService {
  private generateToken(userId: string, email: string, role: string): string {
    const jwtSecret = process.env.JWT_SECRET || 'mySecretKey';
    const jwtExpiration = process.env.JWT_EXPIRATION || '86400000';

    return jwt.sign(
      { id: userId, email, role },
      jwtSecret,
      { expiresIn: parseInt(jwtExpiration) / 1000 }
    );
  }

  async login(loginData: LoginRequest): Promise<AuthResponse> {
    const { email, password } = loginData;

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      throw new AppError('Invalid email or password', 401);
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new AppError('Invalid email or password', 401);
    }

    const token = this.generateToken(user._id.toString(), user.email, user.role);

    const repProfile = await Rep.findOne({ userId: user._id.toString() });

    return {
      token,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department
      },
      repProfile: repProfile || undefined
    };
  }

  async register(registerData: RegisterRequest): Promise<AuthResponse> {
    const { name, email, password, role, department } = registerData;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new AppError('Email already exists', 400);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const aiProfile = {
      strengths: [],
      improvementAreas: [],
      preferredLearningPace: 'medium',
      motivationFactors: []
    };

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: role || 'trainee',
      department,
      aiPersonalityProfile: aiProfile
    });

    const rep = await Rep.create({
      userId: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      aiPersonalityProfile: aiProfile
    });

    const token = this.generateToken(user._id.toString(), user.email, user.role);

    return {
      token,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department
      },
      repProfile: rep
    };
  }

  async getCurrentUser(email: string) {
    const user = await User.findOne({ email });
    if (!user) {
      throw new AppError('User not found', 404);
    }
    return user;
  }

  async getRepProfile(userId: string) {
    const rep = await Rep.findOne({ userId });
    if (!rep) {
      throw new AppError('Rep profile not found', 404);
    }
    return rep;
  }
}

export default new AuthService();
