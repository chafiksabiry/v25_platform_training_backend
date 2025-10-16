// MongoDB initialization script
db = db.getSiblingDB('training_platform');

// Create collections with validation
db.createCollection('users', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['name', 'email', 'password', 'role'],
      properties: {
        name: {
          bsonType: 'string',
          minLength: 2,
          maxLength: 100
        },
        email: {
          bsonType: 'string',
          pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        },
        password: {
          bsonType: 'string',
          minLength: 8
        },
        role: {
          bsonType: 'string',
          enum: ['trainee', 'trainer', 'admin']
        }
      }
    }
  }
});

db.createCollection('companies', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['name', 'industry', 'size'],
      properties: {
        name: {
          bsonType: 'string',
          minLength: 2,
          maxLength: 200
        },
        industry: {
          bsonType: 'string'
        },
        size: {
          bsonType: 'string',
          enum: ['startup', 'small', 'medium', 'large', 'enterprise']
        }
      }
    }
  }
});

db.createCollection('training_journeys');
db.createCollection('training_modules');
db.createCollection('reps');
db.createCollection('rep_progress');

// Create indexes
db.users.createIndex({ email: 1 }, { unique: true });
db.reps.createIndex({ userId: 1 }, { unique: true });
db.reps.createIndex({ email: 1 }, { unique: true });
db.training_journeys.createIndex({ companyId: 1 });
db.training_modules.createIndex({ journeyId: 1 });
db.rep_progress.createIndex({ repId: 1, journeyId: 1, moduleId: 1 }, { unique: true });

print('Database initialized successfully');