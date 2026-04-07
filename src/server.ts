import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import connectDB from './config/database';

const PORT = process.env.PORT || 5010;

const startServer = async () => {
  try {
    connectDB(); // Start connection without blocking server startup

    app.listen(PORT, () => {
      console.log(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║     Training Platform API - Node.js Edition          ║
║                                                       ║
║     Server running on port ${PORT}                      ║
║     Environment: ${process.env.NODE_ENV || 'development'}                     ║
║                                                       ║
║     API Endpoints:                                    ║
║     - POST   /api/auth/register                       ║
║     - POST   /api/auth/login                          ║
║     - GET    /api/auth/me                             ║
║     - GET    /api/journeys                            ║
║     - POST   /api/journeys                            ║
║     - GET    /health                                  ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
      `);
    });

    process.on('SIGTERM', () => {
      console.log('SIGTERM received. Shutting down gracefully...');
      process.exit(0);
    });

    process.on('SIGINT', () => {
      console.log('SIGINT received. Shutting down gracefully...');
      process.exit(0);
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
