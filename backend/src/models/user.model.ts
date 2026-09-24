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
  /** Email-verified flag (PR-AUTH-1) — pre-existing field, now actually enforced. */
  isVerified: boolean;
  emailVerifiedAt?: Date;
  /** SHA-256 hash only — the raw verification token is never persisted. */
  emailVerificationTokenHash?: string;
  emailVerificationExpire?: Date;
  emailVerificationSentAt?: Date;
  /** Dual verification (PR-EMAILVERIFY-2) — same challenge as the link above, SHA-256 hash only, the raw 6-digit code is never persisted. */
  emailVerificationCodeHash?: string;
  emailVerificationCodeExpire?: Date;
  /** Reset to 0 on every new challenge; incremented only on a wrong-code attempt (never on already_verified/expired/malformed). */
  emailVerificationCodeAttempts: number;
  resetPasswordToken?: string;
  resetPasswordExpire?: Date;
  /**
   * Set true ONLY by Super Admin org-owner provisioning (D2) when this
   * account is created with an unknown, never-disclosed random password —
   * cleared to false the moment the real owner sets their own password via
   * `OrganizationInvitationService.activateOwnerAccount`. This is the
   * security gate for that PUBLIC (no-auth) endpoint: it refuses to touch
   * the password of any account where this isn't true, so a stolen/shared
   * OWNER-invitation link for an EXISTING owner (who already has a real
   * password, D3) can never be used to hijack their password.
   */
  pendingPasswordActivation: boolean;
  /** Login brute-force protection (PR-AUTH-4). */
  failedLoginAttempts: number;
  loginLockedUntil?: Date;
  lastLogin?: Date;
  /** Account deletion (PR-PRIVACY-3). Once true, the account is permanently disabled — login/session-validation both reject it, and `email`/`name` are irreversibly anonymized. Never set back to false. */
  isDeleted: boolean;
  deletedAt?: Date;
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
        // Local part allows the standard \w set plus '.', '+' and '-'
        // (e.g. Gmail/Outlook "+" plus-addressing) — kept in sync with the
        // looser express-validator `isEmail()` check already run on
        // /auth/register so a request that passes route validation never
        // then fails here with a confusing 500.
        /^[\w.+-]+@\w+([.-]?\w+)*(\.\w{2,3})+$/,
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
    emailVerifiedAt: { type: Date },
    emailVerificationTokenHash: { type: String, select: false },
    emailVerificationExpire: { type: Date },
    emailVerificationSentAt: { type: Date },
    emailVerificationCodeHash: { type: String, select: false },
    emailVerificationCodeExpire: { type: Date },
    emailVerificationCodeAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpire: Date,
    pendingPasswordActivation: {
      type: Boolean,
      default: false,
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    loginLockedUntil: { type: Date },
    lastLogin: Date,
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: { type: Date },
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
