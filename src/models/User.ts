import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: string;
  department?: string;
  skills?: string[];
  learningStyle: string;
  aiPersonalityProfile?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [100, 'Name cannot exceed 100 characters'],
      trim: true
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false
    },
    role: {
      type: String,
      default: 'trainee',
      enum: ['trainee', 'trainer', 'admin', 'rep']
    },
    department: {
      type: String,
      trim: true
    },
    skills: [{
      type: String,
      trim: true
    }],
    learningStyle: {
      type: String,
      default: 'visual',
      enum: ['visual', 'auditory', 'kinesthetic', 'reading']
    },
    aiPersonalityProfile: {
      type: Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

userSchema.index({ email: 1 });

export default mongoose.model<IUser>('User', userSchema);
