import mongoose from 'mongoose';

const connectDB = async (): Promise<void> => {
  try {
    const mongoUri = process.env.MONGODB_URI || '';

    await mongoose.connect(mongoUri, {
      dbName: process.env.DB_NAME || 'harx',
      serverSelectionTimeoutMS: 5000, // 5 seconds timeout
      connectTimeoutMS: 10000,        // 10 seconds timeout
    });

    console.log('✅ MongoDB connected successfully to', mongoUri.split('@')[1] || 'local');

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
