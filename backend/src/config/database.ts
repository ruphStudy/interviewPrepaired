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
      // The Mongo driver already retries writes/reads internally — this is
      // observation/logging only below, never a hand-rolled reconnect loop.
      retryWrites: true,
      retryReads: true,
      family: 4, // Use IPv4, skip trying IPv6
    };

    // Connect to MongoDB
    await mongoose.connect(env.mongodbUri, options);

    logInfo('MongoDB connected successfully', {
      host: mongoose.connection.host,
      name: mongoose.connection.name,
    });

    // Handle connection events — purely observational; the driver already
    // retries connectivity internally.
    mongoose.connection.on('error', (err) => {
      logError('MongoDB connection error', { error: err instanceof Error ? err.message : String(err) });
    });

    mongoose.connection.on('disconnected', () => {
      logInfo('MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      logInfo('MongoDB reconnected');
    });

    // NOTE: graceful shutdown (including closing this connection) is owned
    // centrally by utils/shutdown.ts's gracefulShutdown(), wired up in
    // server.ts/worker.ts — no SIGINT/SIGTERM handler is registered here to
    // avoid a second, competing shutdown path.
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
