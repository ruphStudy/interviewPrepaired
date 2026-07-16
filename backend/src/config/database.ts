import mongoose from 'mongoose';
import { env } from './environment';
import { logInfo, logError } from '../middleware/logger';

/**
 * Connect to MongoDB database
 */
export const connectDatabase = async (): Promise<void> => {
  try {
    const options = {
      maxPoolSize: 10,
      minPoolSize: 5,
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 10000,
      family: 4, // Use IPv4, skip trying IPv6
    };

    // Connect to MongoDB
    await mongoose.connect(env.mongodbUri, options);

    logInfo('MongoDB connected successfully', {
      host: mongoose.connection.host,
      name: mongoose.connection.name,
    });

    // Handle connection events
    mongoose.connection.on('error', (err) => {
      logError('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      logInfo('MongoDB disconnected');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      logInfo('MongoDB connection closed through app termination');
      process.exit(0);
    });
  } catch (error) {
    logError('Error connecting to MongoDB:', error);
    process.exit(1);
  }
};

/**
 * Disconnect from MongoDB database
 */
export const disconnectDatabase = async (): Promise<void> => {
  try {
    await mongoose.connection.close();
    logInfo('MongoDB disconnected successfully');
  } catch (error) {
    logError('Error disconnecting from MongoDB:', error);
    throw error;
  }
};

/**
 * Get database connection status
 */
export const getDatabaseStatus = (): {
  isConnected: boolean;
  readyState: number;
  host?: string;
  name?: string;
} => {
  return {
    isConnected: mongoose.connection.readyState === 1,
    readyState: mongoose.connection.readyState,
    host: mongoose.connection.host,
    name: mongoose.connection.name,
  };
};

export default mongoose.connection;
