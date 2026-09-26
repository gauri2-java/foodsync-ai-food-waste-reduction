const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env'), quiet: true });

function required(name) {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`Missing required environment variable ${name} (see .env.example)`);
  return value;
}

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 5000),
  logLevel: process.env.LOG_LEVEL || 'info',
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  uploadDir: process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads'),
  weatherEnabled: (process.env.WEATHER_ENABLED || 'true') === 'true',
  jobsEnabled: (process.env.JOBS_ENABLED || 'true') === 'true',
  jobIntervalSec: Number(process.env.JOB_INTERVAL_SEC || 60),
};
