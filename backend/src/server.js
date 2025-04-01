const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const session = require('express-session');
const passport = require('passport');
const path = require('path');
const cookieParser = require('cookie-parser');
const { pool, testConnection } = require('./config/db');

// Load environment variables based on environment
if (process.env.NODE_ENV === 'production') {
    // In production, use environment variables directly
    console.log('Running in production mode');
} else {
    // In development, load from .env file
    dotenv.config({ path: path.join(__dirname, '../.env') });
    console.log('Running in development mode');
}

// Create Express app
const app = express();

// Trust Azure's proxy in production
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// Test database connection
testConnection().then(isConnected => {
    if (!isConnected) {
        console.error('Failed to connect to database');
        process.exit(1);
    }
});

// CORS configuration based on environment
const corsOptions = {
    origin: process.env.NODE_ENV === 'production' 
        ? process.env.FRONTEND_URL 
        : true,
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

// Middleware
app.use(cookieParser(process.env.SESSION_SECRET));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Session configuration based on environment
const sessionConfig = {
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax',
        ...(process.env.NODE_ENV === 'production' && {
            domain: process.env.COOKIE_DOMAIN
        })
    },
    name: 'sessionId',
    rolling: true,
    store: new session.MemoryStore() // For production, consider using Redis
};

app.use(session(sessionConfig));

// Initialize Passport and restore authentication state from session
app.use(passport.initialize());
app.use(passport.session());

// Debug middleware (only in development)
if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
        console.log('Request:', {
            path: req.path,
            method: req.method,
            session: req.session,
            sessionID: req.sessionID,
            isAuthenticated: req.isAuthenticated(),
            user: req.user,
            headers: req.headers,
            cookies: req.cookies,
            signedCookies: req.signedCookies,
            query: req.query
        });
        next();
    });
}

// Routes
app.get('/', (req, res) => {
    const user = req.user;
    res.json({
        message: 'Welcome to the API',
        environment: process.env.NODE_ENV,
        ssoProvider: process.env.SSO_PROVIDER,
        isAuthenticated: req.isAuthenticated(),
        user: user ? {
            displayName: user.displayName,
            email: user._json.email,
            username: user.preferred_username,
            oid: user.oid,
            sub: user.sub,
            provider: process.env.SSO_PROVIDER
        } : null
    });
});

// Authentication routes
app.use('/auth', require('./routes/auth'));

// Protected route example
app.get('/dashboard', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/auth/login');
    }
    const user = req.user;

    try {
        // Test database connection
        const isConnected = await testConnection();
        
        // Get database details
        const [dbInfo] = await pool.query('SELECT DATABASE() as db_name, USER() as db_user, VERSION() as db_version');
        
        res.json({
            message: 'Welcome to the Dashboard',
            user: {
                displayName: user.displayName,
                email: user._json.email,
                username: user.preferred_username,
                oid: user.oid,
                sub: user.sub,
                provider: process.env.SSO_PROVIDER
            },
            database: {
                isConnected,
                details: dbInfo[0],
                host: process.env.DB_HOST || 'localhost',
                database: process.env.DB_NAME || 'manage_system_db'
            }
        });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({
            message: 'Welcome to the Dashboard',
            user: {
                displayName: user.displayName,
                email: user._json.email,
                username: user.preferred_username,
                oid: user.oid,
                sub: user.sub,
                provider: process.env.SSO_PROVIDER
            },
            database: {
                isConnected: false,
                error: error.message
            }
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        error: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error',
        environment: process.env.NODE_ENV,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
    console.log(`SSO Provider: ${process.env.SSO_PROVIDER}`);
    console.log(`Debug Mode: ${process.env.DEBUG}`);
});
