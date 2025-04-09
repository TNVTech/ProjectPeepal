const express = require('express');
const router = express.Router();
const permissionController = require('../../controllers/permissioncontroller');
const db = require('../../config/db');

// Get the pool from the db module
const pool = db.pool;

/**
 * @route POST /api/permission/check
 * @desc Check if a user exists and handle permission request if needed
 * @access Public
 */
router.post('/check', async (req, res) => {
    try {
        const userData = req.body;
        
        if (!userData || !userData.email) {
            return res.status(400).json({ 
                status: 'error', 
                message: 'User data is required' 
            });
        }
        
        const result = await permissionController.checkUserAndHandlePermission(userData);
        res.json(result);
    } catch (error) {
        console.error('Error in permission check route:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'Server error while checking user permission' 
        });
    }
});

/**
 * @route GET /api/permission/requests
 * @desc Get all permission requests
 * @access Private (Admin only)
 */
router.get('/requests', async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.isAuthenticated()) {
            return res.status(401).json({
                status: 'error',
                message: 'You must be logged in to perform this action'
            });
        }

        // Check if user has activeUser in session
        if (!req.session.activeUser) {
            return res.status(401).json({
                status: 'error',
                message: 'User session not found'
            });
        }

        // Check if user is a System Administrator or has list_requests privilege
        const activeUser = req.session.activeUser;
        if (activeUser.role !== 'System Administrator' && 
            (!res.locals.userPrivileges || !res.locals.userPrivileges.includes('list_requests'))) {
            return res.status(403).json({
                status: 'error',
                message: 'You do not have permission to view pending requests'
            });
        }

        let requests = [];

        // Check if user is a system administrator
        if (activeUser.role === 'System Administrator') {
            // Get all pending requests for the company
            const [rows] = await pool.query(
                `SELECT pr.*, c.c_name as company_name, b.b_name as branch_name, r.role_name
                 FROM permission_requests pr
                 LEFT JOIN company c ON pr.company_id = c.company_id
                 LEFT JOIN branches b ON pr.branch_id = b.branch_id
                 LEFT JOIN roles r ON pr.role = r.role_id
                 WHERE pr.company_id = ? AND pr.u_status = 'pending'
                 ORDER BY pr.request_id DESC`,
                [activeUser.company_id]
            );
            requests = rows;
        } else {
            // User has list_requests privilege, get pending requests for their branch
            const [rows] = await pool.query(
                `SELECT pr.*, c.c_name as company_name, b.b_name as branch_name, r.role_name
                 FROM permission_requests pr
                 LEFT JOIN company c ON pr.company_id = c.company_id
                 LEFT JOIN branches b ON pr.branch_id = b.branch_id
                 LEFT JOIN roles r ON pr.role = r.role_id
                 WHERE pr.company_id = ? AND pr.branch_id = ? AND pr.u_status = 'pending'
                 ORDER BY pr.request_id DESC`,
                [activeUser.company_id, activeUser.branch_id]
            );
            requests = rows;
        }

        res.json({
            status: 'success',
            data: requests
        });
    } catch (error) {
        console.error('Error getting permission requests:', error);
        res.status(500).json({
            status: 'error',
            message: 'An error occurred while getting permission requests',
            error: error.message
        });
    }
});

/**
 * @route PUT /api/permission/requests/:requestId
 * @desc Update permission request status
 * @access Private (Admin only)
 */
router.put('/requests/:requestId', async (req, res) => {
    try {
        console.log('PUT /api/permission/requests/:requestId - Request received');
        console.log('Request ID:', req.params.requestId);
        console.log('Request body:', req.body);
        console.log('Content-Type:', req.get('Content-Type'));
        
        // Check if user is authenticated
        if (!req.isAuthenticated()) {
            console.log('User not authenticated');
            return res.status(401).json({
                status: 'error',
                message: 'You must be logged in to perform this action'
            });
        }

        // Check if user has activeUser in session
        if (!req.session.activeUser) {
            console.log('No activeUser in session');
            return res.status(401).json({
                status: 'error',
                message: 'User session not found'
            });
        }

        // Check if user is a System Administrator or has list_requests privilege
        const activeUser = req.session.activeUser;
        console.log('Active user:', activeUser);
        console.log('User privileges:', res.locals.userPrivileges);
        
        if (activeUser.role !== 'System Administrator' && 
            (!res.locals.userPrivileges || !res.locals.userPrivileges.includes('list_requests'))) {
            console.log('User does not have permission');
            return res.status(403).json({
                status: 'error',
                message: 'You do not have permission to update permission requests'
            });
        }

        const { requestId } = req.params;
        const { status, updatedBy } = req.body;
        
        console.log('Processing request with ID:', requestId);
        console.log('Status:', status);
        console.log('Updated by:', updatedBy);
        
        if (!status || !['approved', 'rejected'].includes(status)) {
            console.log('Invalid status:', status);
            return res.status(400).json({
                status: 'error',
                message: 'Invalid status. Must be either "approved" or "rejected"'
            });
        }
        
        if (!updatedBy) {
            console.log('Missing updatedBy');
            return res.status(400).json({
                status: 'error',
                message: 'updatedBy is required'
            });
        }

        // Get the permission request details
        console.log('Fetching permission request details');
        const [requestRows] = await pool.query(
            `SELECT * FROM permission_requests WHERE request_id = ?`,
            [requestId]
        );

        console.log('Request rows:', requestRows);

        if (requestRows.length === 0) {
            console.log('Permission request not found');
            return res.status(404).json({
                status: 'error',
                message: 'Permission request not found'
            });
        }

        const request = requestRows[0];
        console.log('Permission request found:', request);

        // Start a transaction
        console.log('Starting transaction');
        await pool.query('START TRANSACTION');

        try {
            // Update the permission request status
            console.log('Updating permission request status to:', status);
            const updateResult = await pool.query(
                `UPDATE permission_requests SET u_status = ?, approved_by = ?, approved_time = NOW() WHERE request_id = ?`,
                [status, updatedBy, requestId]
            );
            console.log('Update result:', updateResult);

            // If approved, insert the user into the users table
            if (status === 'approved') {
                console.log('Processing approval - checking if user exists');
                // Check if user already exists
                const [existingUser] = await pool.query(
                    `SELECT * FROM users WHERE email = ?`,
                    [request.email]
                );
                console.log('Existing user check result:', existingUser);

                if (existingUser.length === 0) {
                    console.log('User does not exist, inserting new user');
                    // Insert new user
                    const insertResult = await pool.query(
                        `INSERT INTO users (display_name, email, role, branch_id, company_id, u_status, assigned_by, assigned_time) 
                         VALUES (?, ?, ?, ?, ?, 'active', ?, NOW())`,
                        [
                            request.display_name,
                            request.email,
                            request.role,
                            request.branch_id,
                            request.company_id,
                            updatedBy
                        ]
                    );
                    console.log('Insert result:', insertResult);
                } else {
                    console.log('User exists, updating user');
                    // Update existing user
                    const updateUserResult = await pool.query(
                        `UPDATE users SET 
                         display_name = ?, 
                         role = ?, 
                         branch_id = ?, 
                         company_id = ?, 
                         u_status = 'active', 
                         assigned_by = ?, 
                         assigned_time = NOW() 
                         WHERE email = ?`,
                        [
                            request.display_name,
                            request.role,
                            request.branch_id,
                            request.company_id,
                            updatedBy,
                            request.email
                        ]
                    );
                    console.log('Update user result:', updateUserResult);
                }
            }

            // Commit the transaction
            console.log('Committing transaction');
            await pool.query('COMMIT');
            console.log('Transaction committed successfully');

            res.json({
                status: 'success',
                message: `Permission request has been ${status} successfully`
            });
        } catch (error) {
            // Rollback the transaction in case of error
            console.error('Error in transaction, rolling back:', error);
            await pool.query('ROLLBACK');
            throw error;
        }
    } catch (error) {
        console.error('Error updating permission request:', error);
        res.status(500).json({
            status: 'error',
            message: 'An error occurred while updating the permission request',
            error: error.message
        });
    }
});

/**
 * @route GET /api/permission/branches
 * @desc Get branches based on user permissions
 * @access Private
 */
router.get('/branches', async (req, res) => {
    try {
        // Check if user has activeUser in session
        if (!req.session.activeUser) {
            return res.status(401).json({
                status: 'error',
                message: 'User session not found'
            });
        }

        const activeUser = req.session.activeUser;
        let query;
        let params = [];

        if (activeUser.role === 'System Administrator' || 
            (res.locals.userPrivileges && res.locals.userPrivileges.includes('assign_branch'))) {
            // Get all branches in the company
            query = `
                SELECT branch_id, b_name
                FROM branches
                WHERE company_id = ?
                ORDER BY b_name
            `;
            params = [activeUser.company_id];
        } else {
            // Get only user's branch
            query = `
                SELECT branch_id, b_name
                FROM branches
                WHERE branch_id = ?
            `;
            params = [activeUser.branch_id];
        }

        const [branches] = await pool.query(query, params);

        res.json({
            status: 'success',
            data: branches
        });
    } catch (error) {
        console.error('Error fetching branches:', error);
        res.status(500).json({
            status: 'error',
            message: 'An error occurred while fetching branches'
        });
    }
});

/**
 * @route GET /api/permission/roles
 * @desc Get roles based on user permissions
 * @access Private
 */
router.get('/roles', async (req, res) => {
    try {
        // Check if user has activeUser in session
        if (!req.session.activeUser) {
            return res.status(401).json({
                status: 'error',
                message: 'User session not found'
            });
        }

        const activeUser = req.session.activeUser;
        let query;
        let params = [];

        if (activeUser.role === 'System Administrator') {
            // Get all roles in the company
            query = `
                SELECT role_id, role_name
                FROM roles
                WHERE for_company = ?
                ORDER BY role_name
            `;
            params = [activeUser.company_id];
        } else if (res.locals.userPrivileges && res.locals.userPrivileges.includes('assign_role')) {
            // Get roles for the user's branch
            query = `
                SELECT role_id, role_name
                FROM roles
                WHERE for_branch = ?
                ORDER BY role_name
            `;
            params = [activeUser.branch_id];
        } else {
            // Get only user's role
            query = `
                SELECT role_id, role_name
                FROM roles
                WHERE role_id = ?
            `;
            params = [activeUser.role];
        }

        const [roles] = await pool.query(query, params);

        res.json({
            status: 'success',
            data: roles
        });
    } catch (error) {
        console.error('Error fetching roles:', error);
        res.status(500).json({
            status: 'error',
            message: 'An error occurred while fetching roles'
        });
    }
});

module.exports = router;
