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
const authRoutes = require('./routes/auth');
const permissionRoutes = require('./routes/permissionroutes');
app.use('/auth', authRoutes);
app.use('/api/permission', permissionRoutes);

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
        
        // Format user data for response
        let userData = {};
        if (process.env.SSO_PROVIDER === 'azure') {
            userData = {
                displayName: user.displayName || user.name || 'Unknown User',
                email: user._json?.email || user.emails?.[0] || user.preferred_username,
                username: user.preferred_username,
                oid: user.oid,
                sub: user.sub,
                provider: process.env.SSO_PROVIDER
            };
        } else {
            userData = {
                displayName: user.displayName || user.name || 'Unknown User',
                email: user.emails?.[0] || user._json?.email,
                username: user.username,
                id: user.id,
                provider: process.env.SSO_PROVIDER
            };
        }
        
        // Check if user exists in the users table
        const [userRows] = await pool.query(
            'SELECT user_id, u_status FROM users WHERE email = ?',
            [userData.email]
        );
        
        let userStatus = { status: 'unknown' };
        let message = 'Welcome to the Dashboard';
        
        if (userRows.length > 0) {
            const userStatusInDb = userRows[0].u_status;
            if (userStatusInDb === 'active') {
                // User exists and is active, grant access
                userStatus = { status: 'success' };
                message = 'Welcome to the Dashboard';
            } else if (userStatusInDb === 'revoked') {
                // User exists but access is revoked
                userStatus = { status: 'revoked' };
                message = 'Your access has been revoked. Please contact the administrator.';
                // Return error response instead of dashboard data
                return res.status(403).json({
                    status: 'error',
                    message: message,
                    user: userData,
                    userStatus: userStatus
                });
            } else {
                // User exists but has an unknown status
                userStatus = { status: 'error' };
                message = 'Your account status is unknown. Please contact the administrator.';
                return res.status(403).json({
                    status: 'error',
                    message: message,
                    user: userData,
                    userStatus: userStatus
                });
            }
        } else {
            // User doesn't exist in the users table, check permission requests
            const [requestRows] = await pool.query(
                'SELECT * FROM permission_requests WHERE email = ?',
                [userData.email]
            );
            
            if (requestRows.length > 0) {
                const request = requestRows[0];
                if (request.u_status === 'rejected') {
                    userStatus = { status: 'rejected' };
                    message = 'Your approval request has been rejected. Please contact the administrator for more information.';
                } else {
                    userStatus = { status: 'pending' };
                    message = 'Your login was successful, but your request is pending approval';
                }
            } else {
                // No request exists, create a new one
                await pool.query(
                    'INSERT INTO permission_requests (display_name, email, u_status) VALUES (?, ?, ?)',
                    [userData.displayName, userData.email, 'pending']
                );
                
                userStatus = { status: 'pending' };
                message = 'Your login was successful, but your request is pending approval';
            }
        }
        
        // Store user status in session
        req.session.userStatus = userStatus;
        
        res.json({
            message: message,
            user: userData,
            userStatus: userStatus,
            database: {
                isConnected,
                details: dbInfo[0],
                host: process.env.DB_HOST || 'localhost',
                database: process.env.DB_NAME || 'manage_system_db'
            }
        });
    } catch (error) {
        console.error('Database error:', error);
        
        // Format user data for error response
        let userData = {};
        if (process.env.SSO_PROVIDER === 'azure') {
            userData = {
                displayName: user.displayName || user.name || 'Unknown User',
                email: user._json?.email || user.emails?.[0] || user.preferred_username,
                username: user.preferred_username,
                oid: user.oid,
                sub: user.sub,
                provider: process.env.SSO_PROVIDER
            };
        } else {
            userData = {
                displayName: user.displayName || user.name || 'Unknown User',
                email: user.emails?.[0] || user._json?.email,
                username: user.username,
                id: user.id,
                provider: process.env.SSO_PROVIDER
            };
        }
        
        // Determine message based on user status even in case of error
        let message = 'Welcome to the Dashboard';
        if (req.session.userStatus && req.session.userStatus.status === 'pending') {
            message = 'Your login was successful, but your request is pending approval';
        } else if (req.session.userStatus && req.session.userStatus.status === 'rejected') {
            message = 'Your approval request has been rejected. Please contact the administrator for more information.';
        } else if (req.session.userStatus && req.session.userStatus.status === 'revoked') {
            message = 'Your access has been revoked. Please contact the administrator.';
        }
        
        res.status(500).json({
            message: message,
            user: userData,
            userStatus: req.session.userStatus || { status: 'unknown' },
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
