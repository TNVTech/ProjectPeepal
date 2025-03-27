const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const session = require('express-session');
const passport = require('passport');
const path = require('path');
const cookieParser = require('cookie-parser');

// Load environment variables from parent directory
// remove this in webapp keep this in localhost
// dotenv.config({ path: path.join(__dirname, '../.env') });
// use this instead in webappp
dot.env.config();

// Create Express app
const app = express();

// Middleware
app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(cookieParser(process.env.SESSION_SECRET));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production', // true in production
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        httpOnly: true,
        sameSite: 'lax'
    },
    name: 'sessionId',
    rolling: true,
    store: new session.MemoryStore() // Use memory store for development
}));

// Initialize Passport and restore authentication state from session
app.use(passport.initialize());
app.use(passport.session());

// Add debug middleware
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

// Routes
app.get('/', (req, res) => {
    res.json({
        message: 'Welcome to the API',
        environment: process.env.NODE_ENV,
        ssoProvider: process.env.SSO_PROVIDER,
        isAuthenticated: req.isAuthenticated(),
        user: req.user
    });
});

// Authentication routes
app.use('/auth', require('./routes/auth'));

// Protected route example
app.get('/dashboard', (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/auth/login');
    }
    res.json({
        message: 'Welcome to the Dashboard',
        user: req.user,
        provider: process.env.SSO_PROVIDER
    });
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
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`SSO Provider: ${process.env.SSO_PROVIDER}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
    console.log(`Debug Mode: ${process.env.DEBUG}`);
});
