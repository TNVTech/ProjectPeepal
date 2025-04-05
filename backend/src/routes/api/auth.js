const express = require('express');
const passport = require('passport');
const router = express.Router();
const AzureADStrategy = require('passport-azure-ad').OIDCStrategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const crypto = require('crypto');
const permissionController = require('../../controllers/permissioncontroller');
const db = require('../../config/db');

// Passport serialization
passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((user, done) => {
    done(null, user);
});

// Configure SSO based on provider
const SSO_PROVIDER = process.env.SSO_PROVIDER || 'google';

// Define provider-specific scopes
const AZURE_SCOPES = ['openid', 'profile', 'email', 'User.Read'];
const GOOGLE_SCOPES = ['openid', 'profile', 'email'];

if (SSO_PROVIDER === 'azure') {
    // Generate a 32-byte key for cookie encryption
    const key = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);

    // Azure AD Strategy
    const azureADStrategy = new AzureADStrategy({
        identityMetadata: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/v2.0/.well-known/openid-configuration`,
        clientID: process.env.AZURE_CLIENT_ID,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
        responseType: 'code',
        responseMode: 'query',
        redirectUrl: process.env.AZURE_REDIRECT_URL,
        allowHttpForRedirectUrl: true,
        validateIssuer: false, // Set to false for development
        passReqToCallback: true, 
        scope: AZURE_SCOPES,
        loggingLevel: 'info',
        nonceLifetime: 3600,
        nonceMaxAmount: 10,
        useCookieInsteadOfSession: true,
        cookieEncryptionKeys: [
            { key: key, iv: iv }
        ],
        state: true
    }, (req, iss, sub, profile, accessToken, refreshToken, done) => {
        console.log('Azure AD Profile:', profile);
        if (!profile.oid) {
            return done(new Error("No OID found in user profile"));
        }
        return done(null, profile);
    });

    passport.use('azure-ad', azureADStrategy);
    
    // Also register the OAuth2 strategy for compatibility
    passport.use('azure-ad-oauth2', azureADStrategy);

    // Azure AD routes
    router.get('/azure', (req, res, next) => {
        console.log('Starting Azure AD authentication');
        passport.authenticate('azure-ad', { 
            response: res,
            failureRedirect: '/auth/login',
            session: true,
            scope: AZURE_SCOPES,
            prompt: 'select_account',
            responseType: 'code'
        })(req, res, next);
    });

    router.get('/login', (req, res, next) => {
        console.log('Starting Azure AD login');
        passport.authenticate('azure-ad', {
            response: res,
            failureRedirect: '/auth/login',
            session: true,
            scope: AZURE_SCOPES,
            prompt: 'select_account',
            responseType: 'code'
        })(req, res, next);
    });

} else if (SSO_PROVIDER === 'google') {
    // Google Strategy
    const googleStrategy = new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL,
        proxy: true
    }, (accessToken, refreshToken, profile, done) => {
        console.log('Google Profile:', profile);
        // Extract email from Google profile
        const userEmail = profile.emails?.[0]?.value || profile._json?.email;
        console.log('Extracted email:', userEmail);

        // Extract domain from email
        const emailDomain = userEmail ? userEmail.split('@')[1] : null;
        console.log('Extracted domain:', emailDomain);

        return done(null, profile);
    });

    passport.use('google', googleStrategy);

    // Google routes
    router.get('/google', (req, res, next) => {
        console.log('Starting Google authentication');
        passport.authenticate('google', { 
            scope: GOOGLE_SCOPES,
            prompt: 'select_account',
            accessType: 'offline'
        })(req, res, next);
    });

    router.get('/login', (req, res, next) => {
        console.log('Starting Google login');
        passport.authenticate('google', { 
            scope: GOOGLE_SCOPES,
            prompt: 'select_account',
            accessType: 'offline'
        })(req, res, next);
    });
}

// Common callback route for both providers
router.get('/callback', (req, res, next) => {
    console.log('Callback received:', {
        provider: SSO_PROVIDER,
        query: req.query,
        body: req.body,
        headers: req.headers,
        code: req.query.code,
        state: req.query.state,
        error: req.query.error,
        error_description: req.query.error_description,
        sessionID: req.sessionID
    });

    if (req.query.error) {
        console.error('Authentication Error:', {
            error: req.query.error,
            description: req.query.error_description
        });
        return res.redirect('/auth/login');
    }

    const strategy = SSO_PROVIDER === 'azure' ? 'azure-ad' : 'google';
    const scopes = SSO_PROVIDER === 'azure' ? AZURE_SCOPES : GOOGLE_SCOPES;
    
    passport.authenticate(strategy, { 
        failureRedirect: '/auth/login',
        failureMessage: true,
        scope: scopes
    })(req, res, next);
}, async (req, res) => {
    console.log(`${SSO_PROVIDER} Authentication successful`);
    console.log('Raw user data from SSO:', JSON.stringify(req.user, null, 2));
    
    try {
        // Format user data based on the SSO provider
        let userData = {};
        
        if (SSO_PROVIDER === 'azure') {
            console.log(req.user);
            // Azure AD format
            userData = {
                displayName: req.user.displayName || req.user.name || 'Unknown User',
                email: req.user._json.email || req.user.emails?.[0] || req.user._jsonpreferred_username||req.user._json.userPrincipalName,
                // Try different possible locations for company and office data
                companyName: req.user._json.companyName || 
                           req.user._json.organization || 
                           req.user._json.department || 
                           req.user.company || 
                           'Peepal',
                officeLocation: req.user.officeLocation || 
                              req.user._json.department || 
                              req.user._json.physicalDeliveryOfficeName || 
                              'Aldershot'
            };
        } else {
            // Google format
            userData = {
                displayName: req.user.displayName || req.user.name || 'Unknown User',
                email: req.user.emails?.[0] || req.user._json.email,
                // For Google, we can use the domain part of the email as company
                companyName: req.user._json.hd || 
                           (req.user.emails?.[0]?.split('@')[1]) || 
                           'Peepal',
                officeLocation: req.user._json.officeLocation || 
                              req.user._json.department || 
                              'Aldershot'
            };
        }
        
        console.log('Formatted user data for permission check:', {
            email: userData.email,
            displayName: userData.displayName,
            companyName: userData.companyName,
            officeLocation: userData.officeLocation
        });
        
        // Check if user exists in the users table
        const [userRows] = await db.pool.query(
            'SELECT user_id, u_status FROM users WHERE email = ?',
            [userData.email]
        );
        
        let userStatus = { status: 'unknown' };
        
        if (userRows.length > 0) {
            const userStatusInDb = userRows[0].u_status;
            if (userStatusInDb === 'active') {
                // User exists and is active, grant access
                userStatus = { status: 'success' };
                console.log('User exists in the users table and is active, granting access');
            } else if (userStatusInDb === 'revoked') {
                // User exists but access is revoked
                userStatus = { status: 'revoked' };
                console.log('User exists but access is revoked');
            } else {
                // User exists but has an unknown status
                userStatus = { status: 'error' };
                console.log('User exists but has an unknown status:', userStatusInDb);
            }
        } else {
            // User doesn't exist in the users table, check permission requests
            const [requestRows] = await db.pool.query(
                'SELECT * FROM permission_requests WHERE email = ?',
                [userData.email]
            );
            
            if (requestRows.length > 0) {
                const request = requestRows[0];
                if (request.u_status === 'rejected') {
                    userStatus = { status: 'rejected' };
                    console.log('Request was rejected');
                } else if (request.u_status === 'revoked') {
                    userStatus = { status: 'revoked' };
                    console.log('Request was revoked');

                }else if (request.u_status === 'revoked') {
                    userStatus = { status: 'approved' };
                    console.log('Request was approved');
                } else {
                    userStatus = { status: 'pending' };
                    console.log('Request is pending approval');
                }
            } else {
                // No request exists, create a new one
                console.log('Creating new permission request with data:', {
                    email: userData.email,
                    displayName: userData.displayName,
                    companyName: userData.companyName,
                    officeLocation: userData.officeLocation
                });
                
                // Look up company and branch information
                const [companyRows] = await db.pool.query(
                    'SELECT company_id FROM company WHERE c_name = ?',
                    [userData.companyName]
                );
                
                if (companyRows.length === 0) {
                    console.error('Company not found:', userData.companyName);
                    return res.redirect('/dashboard?error=company_not_found');
                }
                
                const [branchRows] = await db.pool.query(
                    'SELECT branch_id FROM branches WHERE b_name = ?',
                    [userData.officeLocation]
                );
                
                if (branchRows.length === 0) {
                    console.error('Branch not found:', userData.officeLocation);
                    return res.redirect('/dashboard?error=branch_not_found');
                }
                
                const companyId = companyRows[0].company_id;
                const branchId = branchRows[0].branch_id;
                
                console.log('Found company and branch:', {
                    companyName: userData.companyName,
                    companyId: companyId,
                    officeLocation: userData.officeLocation,
                    branchId: branchId
                });
                
                // Find the "System user" role for this branch
                const [roleRows] = await db.pool.query(
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
                
                await db.pool.query(
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
                
                userStatus = { status: 'pending' };
                console.log('New permission request created, status is pending');
            }
        }
        
        // Store the user status in the session
        req.session.userStatus = userStatus;
        req.session.user = {
            displayName: userData.displayName,
            email: userData.email,
            status: userStatus.status,
            //role: userStatus.role,
            //permissions: userStatus.permissions
        };
        
        // Redirect to dashboard
        res.redirect('/dashboard');
    } catch (error) {
        console.error('Error checking user permission:', error);
        // Still redirect to dashboard, but the frontend will handle the error
        res.redirect('/dashboard');
    }
});

// Common routes for both providers
router.get('/logout', (req, res) => {
    req.logout(() => {
        res.redirect('/');
    });
});

// Check authentication status
router.get('/status', (req, res) => {
    if (req.isAuthenticated()) {
        res.json({ 
            isAuthenticated: true,
            user: req.user,
            provider: SSO_PROVIDER,
            sessionID: req.sessionID
        });
    } else {
        res.json({ 
            isAuthenticated: false,
            message: 'Not authenticated',
            provider: SSO_PROVIDER,
            sessionID: req.sessionID
        });
    }
});

module.exports = router;
