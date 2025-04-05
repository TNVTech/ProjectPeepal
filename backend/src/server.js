const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const session = require('express-session');
const passport = require('passport');
const path = require('path');
const cookieParser = require('cookie-parser');
const expressLayouts = require('express-ejs-layouts');
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

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Set up express-ejs-layouts
app.use(expressLayouts);
app.set('layout', 'partials/layout');
app.set('layout extractScripts', false);
app.set('layout extractStyles', false);

// Add middleware to set default variables for all views
app.use((req, res, next) => {
    // Set default path based on the current route
    res.locals.path = req.path;
    next();
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

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
            provider: process.env.SSO_PROVIDER,
            company_name: user.companyname,
            company_branch: user.officeLocation
        } : null
    });
});

// Authentication routes
const authRoutes = require('./routes/api/auth');
const permissionRoutes = require('./routes/api/permissionroutes');
app.use('/auth', authRoutes);
app.use('/api/permission', permissionRoutes);

// Protected route example
app.get('/dashboard', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/auth/login');
    }
    
    try {
        const user = req.user;
        const userData = process.env.SSO_PROVIDER === 'azure' ? {
            displayName: user.displayName || user.name || 'Unknown User',
            email: user._json?.email || user.emails?.[0] || user.preferred_username,
            company: user.companyName,
            officeLocation: user.officeLocation
        } : {
            displayName: user.displayName || user.name || 'Unknown User',
            email: user.emails?.[0].value || user._json?.email,
            company: user.companyName,
            officeLocation: user.officeLocation
        };

        // Check user status
        const [userRows] = await pool.query(
            'SELECT user_id, u_status, company_id FROM users WHERE email = ?',
            [userData.email]
        );
        
        if (userRows.length > 0) {
            // User exists in the database
            const userStatus = userRows[0].u_status;
            const companyId = userRows[0].company_id;
            
            // Get company name if company_id exists
            if (companyId) {
                const [companyRows] = await pool.query(
                    'SELECT c_name FROM company WHERE company_id = ?',
                    [companyId]
                );
                
                if (companyRows.length > 0) {
                    userData.company_name = companyRows[0].c_name;
                }
            }
            
            if (userStatus === 'active') {
                // User is active, get company name
                const [companyRows] = await pool.query(
                    'SELECT c_name FROM company WHERE company_id = ?',
                    [companyId]
                );
                
                userData.company_name = companyRows.length > 0 ? companyRows[0].c_name : 'AdminLTE 3';
                
                // Render dashboard with company name
                return res.render('pages/dashboard', {
                    user: userData,
                    title: 'Dashboard',
                    path: '/dashboard',
                    stats: {
                        totalUsers: 150,
                        activeUsers: 120,
                        pendingRequests: 5,
                        revokedAccess: 2
                    }
                });
            } else if (userStatus === 'revoked') {
                // User access has been revoked
                return res.render('pages/auth-status', {
                    status: 'revoked',
                    user: userData,
                    supportEmail: process.env.SUPPORT_EMAIL || 'support@example.com',
                    path: '/auth-status',
                    layout: 'layouts/auth',
                    title: 'Access Request Status'
                });
            } else {
                // User exists but has an unknown status
                return res.render('pages/auth-status', {
                    status: 'unknown',
                    user: userData,
                    supportEmail: process.env.SUPPORT_EMAIL || 'support@example.com',
                    path: '/auth-status',
                    layout: 'layouts/auth',
                    title: 'Access Request Status'
                });
            }
        } else {
            // User doesn't exist in the database, check permission requests
            const [requestRows] = await pool.query(
                'SELECT * FROM permission_requests WHERE email = ?',
                [userData.email]
            );
            
            if (requestRows.length > 0) {
                // Permission request exists, check its status
                const request = requestRows[0];
                
                // Get company name if company_id exists
                if (request.company_id) {
                    const [companyRows] = await pool.query(
                        'SELECT c_name FROM company WHERE company_id = ?',
                        [request.company_id]
                    );
                    
                    if (companyRows.length > 0) {
                        userData.company_name = companyRows[0].c_name;
                    }
                }
                
                if (request.u_status === 'approved') {
                    // Request is approved, redirect to dashboard
                    return res.redirect('/dashboard');
                } else if (request.u_status === 'rejected') {
                    // Request was rejected
                    return res.render('pages/auth-status', {
                        status: 'rejected',
                        user: userData,
                        supportEmail: process.env.SUPPORT_EMAIL || 'support@example.com',
                        path: '/auth-status',
                        layout: 'layouts/auth',
                        title: 'Access Request Status'
                    });
                } else if (request.u_status === 'revoked') {
                    // Request was revoked
                    return res.render('pages/auth-status', {
                        status: 'revoked',
                        user: userData,
                        supportEmail: process.env.SUPPORT_EMAIL || 'support@example.com',
                        path: '/auth-status',
                        layout: 'layouts/auth',
                        title: 'Access Request Status'
                    });
                } else {
                    // Request is pending
                    return res.render('pages/auth-status', {
                        status: 'pending',
                        user: userData,
                        supportEmail: process.env.SUPPORT_EMAIL || 'support@example.com',
                        path: '/auth-status',
                        layout: 'layouts/auth',
                        title: 'Access Request Status'
                    });
                }
            } else {
                // No request exists, create a new one
                console.log('Creating new permission request for:', userData.email); // Debug log
                
                // Look up company and branch information
                const [companyRows] = await pool.query(
                    'SELECT company_id FROM company WHERE c_name = ?',
                    [userData.company]
                );
                
                if (companyRows.length === 0) {
                    console.error('Company not found:', userData.company);
                    return res.redirect('/dashboard?error=company_not_found');
                }
                
                const [branchRows] = await pool.query(
                    'SELECT branch_id FROM branches WHERE b_name = ?',
                    [userData.officeLocation]
                );
                
                if (branchRows.length === 0) {
                    console.error('Branch not found:', userData.officeLocation);
                    return res.redirect('/dashboard?error=branch_not_found');
                }
                
                const companyId = companyRows[0].company_id;
                const branchId = branchRows[0].branch_id;
                
                // Get company name
                userData.company_name = userData.company;
                
                // Find the "System user" role for this branch
                const [roleRows] = await pool.query(
                    'SELECT role_id FROM roles WHERE role_name = ? AND for_branch = ?',
                    ['System user', branchId]
                );
                
                let roleId = null;
                if (roleRows.length > 0) {
                    roleId = roleRows[0].role_id;
                    console.log('Found System user role_id:', roleId);
                } else {
                    console.log('No System user role found for this branch, using NULL for role_id');
                }
                
                await pool.query(
                    `INSERT INTO permission_requests (
                        email, 
                        display_name, 
                        company_id, 
                        branch_id, 
                        role,
                        u_status
                    ) VALUES (?, ?, ?, ?, ?, ?)`,
                    [
                        userData.email,
                        userData.displayName,
                        companyId,
                        branchId,
                        roleId,
                        'pending'
                    ]
                );
                
                return res.render('pages/auth-status', {
                    status: 'pending',
                    user: userData,
                    supportEmail: process.env.SUPPORT_EMAIL || 'support@example.com',
                    path: '/auth-status',
                    layout: 'layouts/auth',
                    title: 'Access Request Status'
                });
            }
        }

        // If we get here, user is active and can access dashboard
        return res.render('pages/dashboard', {
            user: userData,
            title: 'Dashboard',
            path: '/dashboard',
            stats: {
                totalUsers: 150,
                activeUsers: 120,
                pendingRequests: 5,
                revokedAccess: 2
            }
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).render('pages/error', {
            error: process.env.NODE_ENV === 'development' ? error : 'Internal Server Error',
            title: 'Error'
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
