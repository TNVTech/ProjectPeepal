const db = require('../config/db');

/**
 * Middleware to store active user data in session
 */
const storeActiveUser = async (req, res, next) => {
    if (!req.isAuthenticated()) {
        return next();
    }

    try {
        // Extract email from SSO provider data
        const userEmail = req.user._json?.email || 
                         req.user.emails?.[0]?.value || 
                         req.user.preferred_username || 
                         req.user.emails?.[0];

        if (!userEmail) {
            console.error('No email found in user data:', req.user);
            return next();
        }

        console.log('Processing user session for email:', userEmail);
        
        // Get user data from the database
        const [userRows] = await db.pool.query(
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
                company_id: userData.company_id,
                branch_id: userData.branch_id,
                role_id: userData.role,
                lastLogin: new Date().toISOString()
            };

            // Update last login timestamp
            // await db.pool.query(
            //     'UPDATE users SET last_login = NOW() WHERE user_id = ?',
            //     [userData.user_id]
            // );

            console.log('Stored active user in session:', req.session.activeUser);
        } else {
            // If user not found in users table, check permission_requests
            const [requestRows] = await db.pool.query(
                `SELECT pr.*, c.c_name as company_name, b.b_name as branch_name, r.role_name
                 FROM permission_requests pr
                 LEFT JOIN company c ON pr.company_id = c.company_id
                 LEFT JOIN branches b ON pr.branch_id = b.branch_id
                 LEFT JOIN roles r ON pr.role = r.role_id
                 WHERE pr.email = ?`,
                [userEmail]
            );
            
            if (requestRows.length > 0) {
                const requestData = requestRows[0];
                
                // Store request data in session
                req.session.activeUser = {
                    request_id: requestData.request_id,
                    email: requestData.email,
                    displayName: requestData.display_name,
                    company_name: requestData.company_name,
                    branch_name: requestData.branch_name,
                    role: requestData.role_name,
                    status: requestData.u_status,
                    company_id: requestData.company_id,
                    branch_id: requestData.branch_id,
                    role_id: requestData.role,
                    lastLogin: new Date().toISOString()
                };

                console.log('Stored permission request in session:', req.session.activeUser);
            } else {
                console.log('No user or permission request found for email:', userEmail);
            }
        }

        next();
    } catch (error) {
        console.error('Error storing active user:', error);
        next();
    }
};

/**
 * Function to get active user data from the database
 * @param {string} email - User email
 * @returns {Promise<Object|null>} - User data or null if not found
 */
const getActiveUser = async (email) => {
    try {
        // First check users table
        const [userRows] = await db.pool.query(
            `SELECT u.*, c.c_name as company_name, r.role_name, b.b_name as branch_name
             FROM users u 
             LEFT JOIN company c ON u.company_id = c.company_id 
             LEFT JOIN roles r ON u.role_id = r.role_id 
             LEFT JOIN branches b ON u.branch_id = b.branch_id
             WHERE u.email = ? AND u.u_status = 'active'`,
            [email]
        );

        if (userRows.length > 0) {
            return userRows[0];
        }

        // If not found in users table, check permission_requests
        const [requestRows] = await db.pool.query(
            `SELECT pr.*, c.c_name as company_name, b.b_name as branch_name, r.role_name
             FROM permission_requests pr
             LEFT JOIN company c ON pr.company_id = c.company_id
             LEFT JOIN branches b ON pr.branch_id = b.branch_id
             LEFT JOIN roles r ON pr.role = r.role_id
             WHERE pr.email = ? AND pr.u_status = 'approved'`,
            [email]
        );

        if (requestRows.length > 0) {
            return requestRows[0];
        }

        return null;
    } catch (error) {
        console.error('Error getting active user:', error);
        throw error;
    }
};

module.exports = {
    storeActiveUser,
    getActiveUser
}; 