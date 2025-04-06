const mysql = require('mysql2');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables based on environment
if (process.env.NODE_ENV === 'production') {
    // In production, use environment variables directly
    console.log('Using production database configuration');
} else {
    // In development, load from .env file
    dotenv.config({ path: path.join(__dirname, '../../.env') });
    console.log('Using development database configuration');
}

// Database configuration with fallbacks for local development
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'Projectpeepal@123',
    database: process.env.DB_NAME || 'manage_system_db',
    waitForConnections: true,
    connectionLimit: process.env.DB_CONNECTION_LIMIT || 10,
    queueLimit: 0,
    // SSL configuration only in production
    ...(process.env.NODE_ENV === 'production' && {
        ssl: {
            rejectUnauthorized: false
        }
    }),
    // Production-specific settings
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    // Connection timeout
    connectTimeout: process.env.DB_CONNECT_TIMEOUT || 10000,
    // Retry configuration
    retry: {
        max: 3,
        backoffBase: 1000,
        backoffExponent: 1.5
    }
};

console.log('Database configuration:', {
    host: dbConfig.host,
    user: dbConfig.user,
    database: dbConfig.database,
    ssl: dbConfig.ssl ? 'enabled' : 'disabled',
    environment: process.env.NODE_ENV
});

// Create MySQL connection pool
const pool = mysql.createPool(dbConfig);

// Convert pool to use promises
const promisePool = pool.promise();

// Test database connection with retries
const testConnection = async (retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            const [rows] = await promisePool.query('SELECT 1');
            console.log('Database connected successfully');
            return true;
        } catch (error) {
            console.error(`Database connection attempt ${i + 1} failed:`, error);
            if (i < retries - 1) {
                // Wait before retrying (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
            }
        }
    }
    return false;
};

// Handle pool errors
pool.on('error', (err) => {
    console.error('Database pool error:', err);
    if (err.code === 'PROTOCOL_CONNECTION_LOST') {
        console.error('Database connection was closed.');
    }
    if (err.code === 'ER_CON_COUNT_ERROR') {
        console.error('Database has too many connections.');
    }
    if (err.code === 'ECONNREFUSED') {
        console.error('Database connection was refused.');
    }
});

// Wrap the query method to add debugging
const originalQuery = promisePool.query;
promisePool.query = async function(...args) {
    console.log('Executing SQL query:', args[0]);
    console.log('Query parameters:', args.slice(1));
    try {
        const result = await originalQuery.apply(this, args);
        console.log('Query executed successfully');
        return result;
    } catch (error) {
        console.error('Error executing query:', error);
        throw error;
    }
};

module.exports = {
    pool: promisePool,
    testConnection
}; 