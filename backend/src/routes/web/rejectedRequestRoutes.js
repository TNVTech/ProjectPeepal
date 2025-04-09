const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const pool = db.pool;
const axios = require('axios');

// Get rejected requests page
router.get('/', async (req, res) => {
    try {
        if (!req.session.activeUser) {
            return res.redirect('/login');
        }

        const activeUser = req.session.activeUser;
        let rejectedRequests = [];

        if (activeUser.role === 'System Administrator') {
            // Get all rejected requests for System Administrator
            const [rows] = await pool.query(
                `SELECT pr.*, c.c_name as company_name, b.b_name as branch_name, r.role_name
                 FROM permission_requests pr
                 LEFT JOIN company c ON pr.company_id = c.company_id
                 LEFT JOIN branches b ON pr.branch_id = b.branch_id
                 LEFT JOIN roles r ON pr.role = r.role_id
                 WHERE pr.u_status = 'rejected'
                 ORDER BY pr.request_id DESC`
            );
            rejectedRequests = rows;
        } else {
            // Check if user has view_rejected_requests privilege
            const [privileges] = await pool.query(
                `SELECT p.privilege_name 
                 FROM user_privileges up
                 JOIN privileges p ON up.privilege_id = p.privilege_id
                 WHERE up.user_id = ?`,
                [activeUser.user_id]
            );

            const userPrivileges = privileges.map(p => p.privilege_name);

            if (userPrivileges.includes('view_rejected_requests')) {
                // Get rejected requests for user's branch
                const [rows] = await pool.query(
                    `SELECT pr.*, c.c_name as company_name, b.b_name as branch_name, r.role_name
                     FROM permission_requests pr
                     LEFT JOIN company c ON pr.company_id = c.company_id
                     LEFT JOIN branches b ON pr.branch_id = b.branch_id
                     LEFT JOIN roles r ON pr.role = r.role_id
                     WHERE pr.branch_id = ? AND pr.u_status = 'rejected'
                     ORDER BY pr.request_id DESC`,
                    [activeUser.branch_id]
                );
                rejectedRequests = rows;
            }
        }

        // Get stats for sidebar
        const [stats] = await pool.query(
            `SELECT 
                (SELECT COUNT(*) FROM permission_requests WHERE u_status = 'pending') as pendingRequests,
                (SELECT COUNT(*) FROM permission_requests WHERE u_status = 'approved') as approvedRequests,
                (SELECT COUNT(*) FROM permission_requests WHERE u_status = 'rejected') as rejectedRequests,
                (SELECT COUNT(*) FROM users) as totalUsers`
        );

        res.render('pages/rejected-requests', {
            path: '/rejected-requests',
            activeUser: req.session.activeUser,
            userPrivileges: req.session.userPrivileges || [],
            rejectedRequests,
            stats: stats[0]
        });
    } catch (error) {
        console.error('Error in rejected requests page:', error);
        res.render('error', {
            message: 'Failed to load rejected requests',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

// Handle reapproval of rejected request
router.post('/:requestId/reapprove', async (req, res) => {
    try {
        if (!req.session.activeUser) {
            return res.redirect('/login');
        }

        const activeUser = req.session.activeUser;
        const requestId = req.params.requestId;
        const branchId = req.body.branch_id;
        const role = req.body.role;

        // Check if user has permission to reapprove
        if (activeUser.role !== 'System Administrator') {
            const [privileges] = await pool.query(
                `SELECT p.privilege_name 
                 FROM user_privileges up
                 JOIN privileges p ON up.privilege_id = p.privilege_id
                 WHERE up.user_id = ?`,
                [activeUser.user_id]
            );

            const userPrivileges = privileges.map(p => p.privilege_name);
            if (!userPrivileges.includes('reapprove_rejected_request')) {
                req.flash('error', 'You do not have permission to reapprove requests');
                return res.redirect('/rejected-requests');
            }
        }

        // Get the request details
        const [requests] = await pool.query(
            'SELECT * FROM permission_requests WHERE request_id = ?',
            [requestId]
        );

        if (requests.length === 0) {
            req.flash('error', 'Request not found');
            return res.redirect('/rejected-requests');
        }

        const request = requests[0];

        // For non-admin users, verify the request belongs to their branch
        if (activeUser.role !== 'System Administrator' && request.branch_id !== activeUser.branch_id) {
            req.flash('error', 'You can only reapprove requests from your branch');
            return res.redirect('/rejected-requests');
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // Update the request status to approved
            await connection.query(
                'UPDATE permission_requests SET u_status = ?, approved_by = ?, approved_time = NOW() WHERE request_id = ?',
                ['approved', activeUser.user_id, requestId]
            );

            // Use the provided branch_id and role if they exist, otherwise use the original values
            const finalBranchId = branchId || request.branch_id;
            const finalRole = role || request.role;

            // Insert into users table
            await connection.query(
                `INSERT INTO users (
                    display_name, email, company_id, branch_id, role, u_status, created_at, updated_at, assigned_by, assigned_time
                ) VALUES (?, ?, ?, ?, ?, 'active', NOW(), NOW(), ?, NOW())`,
                [
                    request.display_name,
                    request.email,
                    request.company_id,
                    finalBranchId,
                    finalRole,
                    activeUser.user_id
                ]
            );

            await connection.commit();
            req.flash('success', 'Request reapproved successfully');
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

        res.redirect('/rejected-requests');
    } catch (error) {
        console.error('Error reapproving request:', error);
        req.flash('error', 'Failed to reapprove request');
        res.redirect('/rejected-requests');
    }
});

module.exports = router; 