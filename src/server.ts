import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import connectDB from './config/database';

const PORT = process.env.PORT || 5010;

const startServer = () => {
  try {
    // Start listening immediately so Railway health checks pass (prevent 502)
    const server = app.listen(PORT, () => {
      console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║     Training Platform API - Node.js Edition              ║
║                                                          ║
║     Server running on port ${PORT}                       ║
║     Environment: ${process.env.NODE_ENV || 'development'}║
║     Status: LISTENING (Connecting to DB...)              ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
      `);

      // Connect to DB in the background
      connectDB().then(() => {
        console.log('✅ Background DB connection established');
      }).catch(err => {
        console.error('❌ Background DB connection failed:', err);
      });
    });

    process.on('SIGTERM', () => {
      console.log('SIGTERM received. Shutting down gracefully...');
      server.close(() => process.exit(0));
    });

    process.on('SIGINT', () => {
      console.log('SIGINT received. Shutting down gracefully...');
      server.close(() => process.exit(0));
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
