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
const { storeActiveUser } = require('./middleware/userSession');
const csurf = require('csurf');
const flash = require('connect-flash');

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
app.use(flash());

// Initialize Passport and restore authentication state from session
app.use(passport.initialize());
app.use(passport.session());

// Apply userSession middleware after passport initialization
app.use(storeActiveUser);

// Set up CSRF protection
app.use(csurf());

// Add middleware to set default variables for all views
app.use(async (req, res, next) => {
    // Set default path based on the current route
    res.locals.path = req.path;
    
    // Make session data available to all views
    res.locals.session = req.session || {};
    
    // Make activeUser directly available for convenience
    res.locals.activeUser = req.session && req.session.activeUser ? req.session.activeUser : null;
    
    // Add CSRF token to all views
    res.locals.csrfToken = req.csrfToken();
    
    // Initialize stats with default values
    res.locals.stats = {
        pendingRequests: 0,
        totalUsers: 0
    };
    
    // Initialize userPrivileges
    res.locals.userPrivileges = [];
    
    // If user is authenticated, fetch their privileges
    if (req.isAuthenticated() && req.session.activeUser) {
        try {
            // Check if user is a System Administrator
            if (req.session.activeUser.role === 'System Administrator') {
                // System Administrators have all privileges
                res.locals.userPrivileges = ['list_requests', 'manage_users', 'manage_roles', 'manage_permissions'];
            } else {
                // Fetch privileges for other roles
                const [privilegeRows] = await pool.query(
                    `SELECT p.p_name
                     FROM role_privileges rp
                     JOIN privilege p ON rp.privilege_id = p.privilege_id
                     JOIN roles r ON rp.role_id = r.role_id
                     WHERE r.role_name = ?`,
                    [req.session.activeUser.role]
                );
                
                // Extract privilege names
                res.locals.userPrivileges = privilegeRows.map(row => row.p_name);
            }
        } catch (error) {
            console.error('Error fetching user privileges:', error);
        }
    }
    
    // Debug log in development
    if (process.env.NODE_ENV !== 'production') {
        console.log('Session data:', {
            sessionID: req.sessionID,
            activeUser: req.session && req.session.activeUser ? req.session.activeUser : null,
            isAuthenticated: req.isAuthenticated(),
            userPrivileges: res.locals.userPrivileges
        });
    }
    
    next();
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Trust Azure's proxy in production
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
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
const pendingRequestRoutes = require('./routes/api/pendingRequestRoutes');
const approvedRequestRoutes = require('./routes/api/approvedRequestRoutes');
const rejectedRequestRoutes = require('./routes/api/rejectedRequestRoutes');
const userRoutes = require('./routes/api/userRoutes');
const revokedUserRoutes = require('./routes/api/revokedUserRoutes');
const addUserRoutes = require('./routes/api/addUserRoutes');
app.use('/auth', authRoutes);
app.use('/api/permission', permissionRoutes);
app.use('/api/pending-requests', pendingRequestRoutes);
app.use('/api/approved-requests', approvedRequestRoutes);
app.use('/api/rejected-requests', rejectedRequestRoutes);
app.use('/api/users', userRoutes);
app.use('/api/revoked-users', revokedUserRoutes);
app.use('/api/add-user', addUserRoutes);

// Web routes
const approvalRoutes = require('./routes/web/approvalRoutes');
const approvedRequestWebRoutes = require('./routes/web/approvedRequestRoutes');
const rejectedRequestWebRoutes = require('./routes/web/rejectedRequestRoutes');
const userWebRoutes = require('./routes/web/userRoutes');
const revokedUserWebRoutes = require('./routes/web/revokedUserRoutes');
const addUserWebRoutes = require('./routes/web/addUserRoutes');
app.use('/approvals', approvalRoutes);
app.use('/approved-requests', approvedRequestWebRoutes);
app.use('/rejected-requests', rejectedRequestWebRoutes);
app.use('/users', userWebRoutes);
app.use('/revoked-users', revokedUserWebRoutes);
app.use('/add-user', addUserWebRoutes);

// Add middleware to update sidebar stats
app.use(async (req, res, next) => {
    // Only update stats if user is authenticated
    if (req.isAuthenticated() && req.session.activeUser) {
        try {
            const activeUser = req.session.activeUser;
            
            // Check if user is a System Administrator or has list_requests privilege
            if (activeUser.role === 'System Administrator' || 
                (res.locals.userPrivileges && res.locals.userPrivileges.includes('list_requests'))) {
                
                // Get count of pending requests
                let countQuery = '';
                let countParams = [];

                if (activeUser.role === 'System Administrator') {
                    countQuery = `
                        SELECT COUNT(*) as count
                        FROM permission_requests
                        WHERE company_id = ? AND u_status = 'pending'
                    `;
                    countParams = [activeUser.company_id];
                } else {
                    countQuery = `
                        SELECT COUNT(*) as count
                        FROM permission_requests
                        WHERE company_id = ? AND branch_id = ? AND u_status = 'pending'
                    `;
                    countParams = [activeUser.company_id, activeUser.branch_id];
                }

                const [countResult] = await pool.query(countQuery, countParams);
                res.locals.stats.pendingRequests = countResult[0].count;
            }
            
            // Get count of total users
            let userCountQuery = '';
            let userCountParams = [];

            if (activeUser.role === 'System Administrator') {
                userCountQuery = `
                    SELECT COUNT(*) as count
                    FROM users
                    WHERE company_id = ?
                `;
                userCountParams = [activeUser.company_id];
            } else {
                userCountQuery = `
                    SELECT COUNT(*) as count
                    FROM users
                    WHERE company_id = ? AND branch_id = ?
                `;
                userCountParams = [activeUser.company_id, activeUser.branch_id];
            }

            const [userCountResult] = await pool.query(userCountQuery, userCountParams);
            res.locals.stats.totalUsers = userCountResult[0].count;
            
            // Get count of revoked users
            let revokedUserCountQuery = '';
            let revokedUserCountParams = [];

            if (activeUser.role === 'System Administrator') {
                revokedUserCountQuery = `
                    SELECT COUNT(*) as count
                    FROM users
                    WHERE company_id = ? AND u_status = 'revoked'
                `;
                revokedUserCountParams = [activeUser.company_id];
            } else {
                revokedUserCountQuery = `
                    SELECT COUNT(*) as count
                    FROM users
                    WHERE company_id = ? AND branch_id = ? AND u_status = 'revoked'
                `;
                revokedUserCountParams = [activeUser.company_id, activeUser.branch_id];
            }

            const [revokedUserCountResult] = await pool.query(revokedUserCountQuery, revokedUserCountParams);
            res.locals.stats.revokedUsers = revokedUserCountResult[0].count;
            
        } catch (error) {
            console.error('Error updating sidebar stats:', error);
        }
    }
    
    next();
});

// Protected route example
app.get('/dashboard', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/auth/login');
    }
    
    try {
        const user = req.user;
        const userEmail = user._json?.email || user.emails?.[0]?.value || user.preferred_username;
        
        // Get user data from the database
        const [userRows] = await pool.query(
            `SELECT u.*, c.c_name as company_name, r.role_name, b.b_name as branch_name
             FROM users u 
             LEFT JOIN company c ON u.company_id = c.company_id 
             LEFT JOIN roles r ON u.role = r.role_id 
             LEFT JOIN branches b ON u.branch_id = b.branch_id
             WHERE u.email = ?`,
            [userEmail]
        );

        if (userRows.length > 0) {
            const userData = userRows[0];
            
            // Store user data in session
            req.session.activeUser = {
                user_id: userData.user_id,
                email: userData.email,
                displayName: userData.display_name,
                company_name: userData.company_name,
                branch_name: userData.branch_name,
                role: userData.role_name,
                status: userData.u_status,
                lastLogin: new Date().toISOString()
            };

            // Update last login timestamp
            // await pool.query(
            //     'UPDATE users SET last_login = NOW() WHERE user_id = ?',
            //     [userData.user_id]
            // );

            // Render dashboard with user data
            return res.render('pages/dashboard', {
                title: 'Dashboard',
                path: '/dashboard',
                stats: {
                    totalUsers: 150,
                    activeUsers: 120,
                    pendingRequests: 5,
                    revokedAccess: 2
                }
            });
        } else {
            // User doesn't exist in the database, check permission requests
            const [requestRows] = await pool.query(
                'SELECT * FROM permission_requests WHERE email = ?',
                [userEmail]
            );
            
            if (requestRows.length > 0) {
                // Permission request exists, check its status
                const request = requestRows[0];
                
                // Store request data in session
                req.session.activeUser = {
                    request_id: request.request_id,
                    email: request.email,
                    displayName: request.display_name,
                    company_name: request.company_name,
                    branch_name: request.branch_name,
                    role: request.role_name,
                    status: request.u_status,
                    company_id: request.company_id,
                    branch_id: request.branch_id,
                    role_id: request.role
                };

                return res.render('pages/auth-status', {
                    status: request.u_status,
                    supportEmail: process.env.SUPPORT_EMAIL || 'support@example.com',
                    path: '/auth-status',
                    layout: 'layouts/auth',
                    title: 'Access Request Status',
                    activeUser: req.session.activeUser
                });
            }
        }

        // If we get here, neither user nor request was found
        return res.render('pages/auth-status', {
            status: 'not_found',
            supportEmail: process.env.SUPPORT_EMAIL || 'support@example.com',
            path: '/auth-status',
            layout: 'layouts/auth',
            title: 'Access Request Status',
            activeUser: req.session.activeUser
        });
    } catch (error) {
        console.error('Error in dashboard route:', error);
        return res.render('pages/error', {
            error: 'An error occurred while loading the dashboard',
            path: '/error',
            layout: 'layouts/auth',
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
