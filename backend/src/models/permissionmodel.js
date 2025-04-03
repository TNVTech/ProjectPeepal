const db = require('../config/db');

/**
 * Check if a user exists in the users table by email
 * @param {string} email - The email to check
 * @returns {Promise<boolean>} - True if user exists, false otherwise
 */
const userExists = async (email) => {
    try {
        console.log(`Checking if user with email ${email} exists in the database`);
        const [rows] = await db.pool.query(
            'SELECT user_id FROM users WHERE email = ?',
            [email]
        );
        const exists = rows.length > 0;
        console.log(`User ${email} exists: ${exists}`);
        return exists;
    } catch (error) {
        console.error('Error checking if user exists:', error);
        throw error;
    }
};

/**
 * Add a new permission request
 * @param {Object} userData - User data from SSO
 * @returns {Promise<Object>} - The created permission request
 */
const addPermissionRequest = async (userData) => {
    try {
        console.log('Adding new permission request for user:', userData);
        
        // Check if a request already exists for this email
        const existingRequest = await getPermissionRequestByEmail(userData.email);
        if (existingRequest) {
            console.log('Permission request already exists for this email');
            return existingRequest;
        }
        
        const [result] = await db.pool.query(
            'INSERT INTO permission_requests (display_name, email, u_status) VALUES (?, ?, ?)',
            [userData.displayName, userData.email, 'pending']
        );
        
        console.log('Permission request added successfully with ID:', result.insertId);
        
        return {
            request_id: result.insertId,
            display_name: userData.displayName,
            email: userData.email,
            u_status: 'pending'
        };
    } catch (error) {
        console.error('Error adding permission request:', error);
        throw error;
    }
};

/**
 * Get permission request status by email
 * @param {string} email - The email to check
 * @returns {Promise<Object|null>} - The permission request or null if not found
 */
const getPermissionRequestByEmail = async (email) => {
    try {
        console.log(`Getting permission request for email: ${email}`);
        const [rows] = await db.pool.query(
            'SELECT * FROM permission_requests WHERE email = ?',
            [email]
        );
        console.log(`Found ${rows.length} permission requests for email ${email}`);
        return rows.length > 0 ? rows[0] : null;
    } catch (error) {
        console.error('Error getting permission request:', error);
        throw error;
    }
};

/**
 * Update permission request status
 * @param {number} requestId - The ID of the request to update
 * @param {string} status - The new status (approved, rejected)
 * @param {number} updatedBy - The ID of the user updating the request
 * @returns {Promise<Object>} - The updated permission request
 */
const updatePermissionRequestStatus = async (requestId, status, updatedBy) => {
    try {
        console.log(`Updating permission request ${requestId} to status: ${status}`);
        
        // Get the request details
        const [requestRows] = await db.pool.query(
            'SELECT * FROM permission_requests WHERE request_id = ?',
            [requestId]
        );
        
        if (requestRows.length === 0) {
            console.log(`Permission request ${requestId} not found`);
            return null;
        }
        
        const request = requestRows[0];
        
        // Start a transaction
        await db.pool.query('START TRANSACTION');
        
        try {
            // Update the permission request status
            await db.pool.query(
                'UPDATE permission_requests SET u_status = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE request_id = ?',
                [status, updatedBy, requestId]
            );
            
            // If status is approved, add the user to the users table
            if (status === 'approved') {
                console.log(`Adding user ${request.email} to users table`);
                
                // Check if user already exists
                const userExists = await userExists(request.email);
                
                if (!userExists) {
                    // Insert into users table
                    await db.pool.query(
                        'INSERT INTO users (display_name, email, u_status) VALUES (?, ?, ?)',
                        [request.display_name, request.email, 'active']
                    );
                    console.log(`User ${request.email} added to users table`);
                } else {
                    console.log(`User ${request.email} already exists in users table`);
                }
            }
            
            // Commit the transaction
            await db.pool.query('COMMIT');
            
            // Get the updated request
            const [updatedRows] = await db.pool.query(
                'SELECT * FROM permission_requests WHERE request_id = ?',
                [requestId]
            );
            
            console.log(`Permission request ${requestId} updated successfully`);
            return updatedRows[0];
        } catch (error) {
            // Rollback the transaction on error
            await db.pool.query('ROLLBACK');
            throw error;
        }
    } catch (error) {
        console.error('Error updating permission request status:', error);
        throw error;
    }
};

/**
 * Get all permission requests
 * @returns {Promise<Array>} - List of permission requests
 */
const getAllPermissionRequests = async () => {
    try {
        const [rows] = await db.pool.query('SELECT * FROM permission_requests ORDER BY request_id DESC');
        return rows;
    } catch (error) {
        console.error('Error getting all permission requests:', error);
        throw error;
    }
};

module.exports = {
    userExists,
    addPermissionRequest,
    getPermissionRequestByEmail,
    updatePermissionRequestStatus,
    getAllPermissionRequests
};
