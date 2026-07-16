import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/environment';

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: 'user' | 'admin';
  avatar?: string;
  preferences: {
    defaultInterviewType?: string;
    defaultDifficulty?: string;
    notifications: boolean;
    theme: 'light' | 'dark' | 'auto';
  };
  stats: {
    totalInterviews: number;
    completedInterviews: number;
    averageScore: number;
    lastInterviewDate?: Date;
  };
  isActive: boolean;
  isVerified: boolean;
  verificationToken?: string;
  resetPasswordToken?: string;
  resetPasswordExpire?: Date;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(enteredPassword: string): Promise<boolean>;
  generateToken(): string;
}

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, 'Please add a name'],
      trim: true,
      maxlength: [50, 'Name cannot be more than 50 characters'],
    },
    email: {
      type: String,
      required: [true, 'Please add an email'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please add a valid email',
      ],
      index: true,
    },
    password: {
      type: String,
      required: [true, 'Please add a password'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    avatar: {
      type: String,
    },
    preferences: {
      defaultInterviewType: {
        type: String,
        enum: [
          'technical',
          'behavioral',
          'leadership',
          'managerial',
          'system-design',
          'coding',
          'product',
          'general',
        ],
      },
      defaultDifficulty: {
        type: String,
        enum: ['beginner', 'intermediate', 'advanced', 'expert'],
      },
      notifications: {
        type: Boolean,
        default: true,
      },
      theme: {
        type: String,
        enum: ['light', 'dark', 'auto'],
        default: 'auto',
      },
    },
    stats: {
      totalInterviews: { type: Number, default: 0 },
      completedInterviews: { type: Number, default: 0 },
      averageScore: { type: Number, default: 0 },
      lastInterviewDate: { type: Date },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationToken: String,
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    lastLogin: Date,
  },
  {
    timestamps: true,
    collection: 'users',
  }
);

// Encrypt password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password
userSchema.methods.comparePassword = async function (
  enteredPassword: string
): Promise<boolean> {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate JWT token
userSchema.methods.generateToken = function (): string {
  return jwt.sign({ id: this._id, role: this.role }, env.jwtSecret as string, {
    expiresIn: env.jwtExpire,
  } as jwt.SignOptions);
};

export const User = mongoose.model<IUser>('User', userSchema);
