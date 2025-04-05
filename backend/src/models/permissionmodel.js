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
 * @param {Object} userData - User data including email, display name, company name, and office location
 * @returns {Promise<Object>} - The created permission request
 */
const addPermissionRequest = async (userData) => {
    try {
        console.log('Adding permission request for user:', userData);
        
        // Check if a request already exists for this email
        const existingRequest = await getPermissionRequestByEmail(userData.email);
        if (existingRequest) {
            console.log('Permission request already exists for this email');
            return existingRequest;
        }

        // Get company_id from company table based on company name
        const [companyRows] = await db.pool.query(
            'SELECT company_id FROM company WHERE c_name = ?',
            [userData.companyName]
        );

        if (companyRows.length === 0) {
            console.error('Company not found:', userData.companyName);
            throw new Error('Company not found in the system');
        }

        const companyId = companyRows[0].company_id;
        console.log('Found company_id:', companyId);

        // Get branch_id from branches table based on office location
        const [branchRows] = await db.pool.query(
            'SELECT branch_id FROM branches WHERE b_name = ?',
            [userData.officeLocation]
        );

        if (branchRows.length === 0) {
            console.error('Branch not found:', userData.officeLocation);
            throw new Error('Branch not found in the system');
        }

        const branchId = branchRows[0].branch_id;
        console.log('Found branch_id:', branchId);
        
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
        
        const [result] = await db.pool.query(
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
        
        console.log('Permission request added successfully with ID:', result.insertId);
        
        // Get the newly created request with all fields
        const [rows] = await db.pool.query(
            'SELECT * FROM permission_requests WHERE request_id = ?',
            [result.insertId]
        );
        
        if (rows.length === 0) {
            throw new Error('Failed to retrieve newly created permission request');
        }
        
        return rows[0];
    } catch (error) {
        console.error('Error adding permission request:', error);
        throw error;
    }
};

/**
 * Get permission request by email
 * @param {string} email - User's email
 * @returns {Promise<Object|null>} - The permission request if found
 */
const getPermissionRequestByEmail = async (email) => {
    try {
        console.log('Getting permission request for email:', email);
        
        const [rows] = await db.pool.query(
            'SELECT * FROM permission_requests WHERE email = ?',
            [email]
        );
        
        if (rows.length === 0) {
            console.log('No permission request found for email:', email);
            return null;
        }
        
        console.log('Permission request found:', rows[0]);
        return rows[0];
    } catch (error) {
        console.error('Error getting permission request:', error);
        throw error;
    }
};

/**
 * Update permission request status
 * @param {number} requestId - The ID of the request to update
 * @param {string} status - The new status (approved, rejected, revoked)
 * @param {number} updatedBy - The ID of the user updating the request
 * @returns {Promise<Object>} - The updated permission request
 */
const updatePermissionRequestStatus = async (requestId, status, updatedBy) => {
    try {
        console.log(`Updating permission request ${requestId} to status: ${status}`);
        
        await db.pool.query(
            'UPDATE permission_requests SET u_status = ? WHERE request_id = ?',
            [status, requestId]
        );
        
        const [rows] = await db.pool.query(
            'SELECT * FROM permission_requests WHERE request_id = ?',
            [requestId]
        );
        
        console.log('Permission request updated successfully:', rows[0]);
        return rows[0];
    } catch (error) {
        console.error('Error updating permission request:', error);
        throw error;
    }
};

/**
 * Get all permission requests
 * @returns {Promise<Array>} - List of all permission requests
 */
const getAllPermissionRequests = async () => {
    try {
        console.log('Getting all permission requests');
        
        const [rows] = await db.pool.query(
            'SELECT * FROM permission_requests ORDER BY request_id DESC'
        );
        
        console.log(`Found ${rows.length} permission requests`);
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
