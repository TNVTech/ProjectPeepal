const express = require('express');
const router = express.Router();
const passport = require('passport');
const AzureADStrategy = require('passport-azure-ad').OIDCStrategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const crypto = require('crypto');

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
}, (req, res) => {
    console.log(`${SSO_PROVIDER} Authentication successful`);
    res.redirect('/dashboard');
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
