import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User, IUser } from '../models/user.model';
import { ApiError } from '../utils/ApiError';
import { catchAsync } from '../utils/catchAsync';
import { env } from '../config/environment';

export interface AuthRequest extends Request {
  user?: IUser;
}

export const protect = catchAsync(
  async (req: AuthRequest, _res: Response, next: NextFunction) => {
    let token: string | undefined;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      throw new ApiError(401, 'Not authorized to access this route');
    }

    try {
      const decoded = jwt.verify(token, env.jwtSecret) as { id: string; role: string };

      const user = await User.findById(decoded.id).select('-password');

      if (!user) {
        throw new ApiError(401, 'User not found');
      }

      if (!user.isActive) {
        throw new ApiError(401, 'User account is deactivated');
      }

      req.user = user;
      next();
    } catch (error) {
      throw new ApiError(401, 'Not authorized to access this route');
    }
  }
);

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new ApiError(401, 'Not authorized to access this route');
    }

    if (!roles.includes(req.user.role)) {
      throw new ApiError(
        403,
        `User role '${req.user.role}' is not authorized to access this route`
      );
    }

    next();
  };
};
