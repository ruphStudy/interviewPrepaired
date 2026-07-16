import { Response, NextFunction } from 'express';
import { User } from '../models/user.model';
import { AuthRequest } from './auth';

/**
 * Mock authentication middleware for development/testing
 * Automatically creates and uses a test user if no authentication is provided
 * 
 * ⚠️ WARNING: DO NOT USE IN PRODUCTION!
 */
export const mockAuthForDev = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  try {
    console.log('🔐 [MockAuth] mockAuthForDev called');
    
    // If already authenticated (via real token), skip mock auth
    if (req.user) {
      console.log('🔐 [MockAuth] User already authenticated:', req.user);
      return next();
    }

    console.log('🔐 [MockAuth] No user found, creating/finding test user...');
    // Find or create test user
    let testUser = await User.findOne({ email: 'test@example.com' });
    
    if (!testUser) {
      console.log('🔐 [MockAuth] Test user not found, creating new one...');
      testUser = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123', // Will be hashed by the model
        role: 'user',
        isActive: true,
        isVerified: true,
      });
      console.log('🔐 [MockAuth] Test user created:', testUser._id);
    } else {
      console.log('🔐 [MockAuth] Test user found:', testUser._id);
    }

    req.user = testUser;
    console.log('✅ [MockAuth] Mock user attached to request');
    next();
  } catch (error) {
    console.error('❌ [MockAuth] Error in mockAuthForDev:', error);
    next(error);
  }
};
