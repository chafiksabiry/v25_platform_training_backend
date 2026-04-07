import mongoose from 'mongoose';

const connectDB = async (): Promise<void> => {
  try {
    const mongoUri = process.env.MONGODB_URI || '';

    if (!mongoUri) {
      console.error('CRITICAL ERROR: MONGODB_URI is not defined in environment variables');
      return; // Return instead of exit to let the server start (for health checks)
    }

    await mongoose.connect(mongoUri, {
      dbName: process.env.DB_NAME || 'harx'
    });

    console.log('MongoDB connected successfully');

    mongoose.connection.on('error', (error) => {
      console.error('MongoDB connection error:', error);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected');
    });

  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    // process.exit(1); // Modified to permit starting even if DB connection fails temporarily
  }
};

export default connectDB;
