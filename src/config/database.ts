import mongoose from 'mongoose';

const connectDB = async (): Promise<void> => {
  try {
    const mongoUri = process.env.MONGODB_URI || '';

    if (!mongoUri) {
      console.error('CRITICAL ERROR: MONGODB_URI is not defined in environment variables');
      return; // Return instead of exit to let the server start (for health checks)
    }

    await mongoose.connect(mongoUri, {
      dbName: process.env.DB_NAME || 'harx',
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
      socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
    });

    console.log('✅ MongoDB connected successfully to ' + mongoose.connection.host);

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
