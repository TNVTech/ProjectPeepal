const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const pool = db.pool;
const axios = require('axios');

/**
 * @route GET /approvals
 * @desc Render the approvals page
 * @access Private (Admin only)
 */
router.get('/', async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.isAuthenticated()) {
            return res.redirect('/login');
        }

        // Check if user has activeUser in session
        if (!req.session.activeUser) {
            return res.redirect('/login');
        }

        // Check if user is a System Administrator or has list_requests privilege
        const activeUser = req.session.activeUser;
        if (activeUser.role !== 'System Administrator' && 
            (!res.locals.userPrivileges || !res.locals.userPrivileges.includes('list_requests'))) {
            return res.status(403).render('error', {
                message: 'You do not have permission to view the approvals page',
                error: {
                    status: 403,
                    stack: ''
                }
            });
        }

        let pendingRequests = [];
        let pendingCount = 0;

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
            pendingRequests = rows;
            pendingCount = rows.length;
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
            pendingRequests = rows;
            pendingCount = rows.length;
        }

        res.render('pages/approvals', {
            title: 'Pending Approvals',
            path: '/approvals',
            pendingRequests,
            pendingCount,
            activeUser
        });
    } catch (error) {
        console.error('Error rendering approvals page:', error);
        res.status(500).render('error', {
            message: 'An error occurred while loading the approvals page',
            error: {
                status: 500,
                stack: error.stack
            }
        });
    }
});

/**
 * @route POST /approvals/confirm
 * @desc Confirm approval or rejection of a permission request
 * @access Private (Admin only)
 */
router.post('/confirm', async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.isAuthenticated()) {
            return res.redirect('/login');
        }

        // Check if user has activeUser in session
        if (!req.session.activeUser) {
            return res.redirect('/login');
        }

        // Check if user has permission to update requests
        const hasPermission = req.session.activeUser.privileges && 
            (req.session.activeUser.privileges.includes('update_requests') || 
             req.session.activeUser.role === 'system administrator');
        
        const { requestId, action, branch_id, role } = req.body;
        
        if (!requestId || !action || !['approve', 'reject'].includes(action)) {
            req.flash('error', 'Invalid request parameters');
            return res.redirect('/approvals');
        }

        const status = action === 'approve' ? 'approved' : 'rejected';
        const userId = req.session.activeUser.user_id;

        // Get the permission request details
        console.log('Fetching permission request details');
        const [requestRows] = await pool.query(
            `SELECT * FROM permission_requests WHERE request_id = ?`,
            [requestId]
        );

        console.log('Request rows:', requestRows);

        if (requestRows.length === 0) {
            console.log('Permission request not found');
            req.flash('error', 'Permission request not found');
            return res.redirect('/approvals');
        }

        const request = requestRows[0];
        console.log('Permission request found:', request);

        // If branch_id or role is provided, validate them
        if (branch_id || role) {
            const activeUser = req.session.activeUser;

            if (branch_id) {
                // Validate branch_id
                if (activeUser.role !== 'System Administrator' && 
                    (!res.locals.userPrivileges || !res.locals.userPrivileges.includes('assign_branch'))) {
                    req.flash('error', 'You do not have permission to change branch');
                    return res.redirect('/approvals');
                }

                // Check if branch exists and belongs to the company
                const [branchCheck] = await pool.query(
                    'SELECT 1 FROM branches WHERE branch_id = ? AND company_id = ?',
                    [branch_id, activeUser.company_id]
                );

                if (branchCheck.length === 0) {
                    req.flash('error', 'Invalid branch selected');
                    return res.redirect('/approvals');
                }

                // Update the request with new branch_id
                request.branch_id = branch_id;
            }

            if (role) {
                // Validate role
                if (activeUser.role === 'System Administrator') {
                    // Check if role belongs to the company
                    const [roleCheck] = await pool.query(
                        'SELECT 1 FROM roles WHERE role_id = ? AND for_company = ?',
                        [role, activeUser.company_id]
                    );

                    if (roleCheck.length === 0) {
                        req.flash('error', 'Invalid role selected');
                        return res.redirect('/approvals');
                    }
                } else if (res.locals.userPrivileges && res.locals.userPrivileges.includes('assign_role')) {
                    // Check if role belongs to the branch
                    const [roleCheck] = await pool.query(
                        'SELECT 1 FROM roles WHERE role_id = ? AND for_branch = ?',
                        [role, activeUser.branch_id]
                    );

                    if (roleCheck.length === 0) {
                        req.flash('error', 'Invalid role selected');
                        return res.redirect('/approvals');
                    }
                } else {
                    req.flash('error', 'You do not have permission to change role');
                    return res.redirect('/approvals');
                }

                // Update the request with new role
                request.role = role;
            }
        }

        // Start a transaction
        console.log('Starting transaction');
        await pool.query('START TRANSACTION');

        try {
            // Update the permission request status
            console.log('Updating permission request status to:', status);
            const updateResult = await pool.query(
                `UPDATE permission_requests SET u_status = ?, approved_by = ?, approved_time = NOW() WHERE request_id = ?`,
                [status, userId, requestId]
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
                            userId
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
                            userId,
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

            req.flash('success', `Permission request has been ${status} successfully`);
            res.redirect('/approvals');
        } catch (error) {
            // Rollback the transaction in case of error
            console.error('Error in transaction, rolling back:', error);
            await pool.query('ROLLBACK');
            throw error;
        }
    } catch (error) {
        console.error('Error confirming permission request:', error);
        //req.flash('error', 'An error occurred while processing your request');
        res.redirect('/approvals');
    }
});

module.exports = router; 