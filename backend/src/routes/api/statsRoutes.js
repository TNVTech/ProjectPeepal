const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const pool = db.pool;

/**
 * @route GET /api/stats/sidebar
 * @desc Get sidebar stats based on user role and privileges
 * @access Private
 */
router.get('/sidebar', async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.isAuthenticated()) {
            return res.status(401).json({
                success: false,
                message: 'You must be logged in to perform this action'
            });
        }

        // Check if user has activeUser in session
        if (!req.session.activeUser) {
            return res.status(401).json({
                success: false,
                message: 'User session not found'
            });
        }

        const activeUser = req.session.activeUser;
        let stats = {
            pendingRequests: 0,
            totalUsers: 0,
            revokedUsers: 0,
            approvedRequests: 0
        };

        // Get pending requests count based on role and privileges
        if (activeUser.role === 'System Administrator') {
            // System Administrator can see all pending requests for the company
            const [pendingRequestsResult] = await pool.query(
                `SELECT COUNT(*) as count
                 FROM permission_requests
                 WHERE company_id = ? AND u_status = 'pending'`,
                [activeUser.company_id]
            );
            stats.pendingRequests = pendingRequestsResult[0].count;
        } else {
            // Check if user has the list_requests privilege
            const [privilegeCheck] = await pool.query(
                `SELECT 1 FROM user_privileges up
                JOIN privileges p ON up.privilege_id = p.privilege_id
                WHERE up.user_id = ? AND p.privilege_name = 'list_requests'`,
                [activeUser.user_id]
            );

            if (privilegeCheck.length > 0) {
                // User with privilege can see pending requests for their branch
                const [pendingRequestsResult] = await pool.query(
                    `SELECT COUNT(*) as count
                     FROM permission_requests
                     WHERE company_id = ? AND branch_id = ? AND u_status = 'pending'`,
                    [activeUser.company_id, activeUser.branch_id]
                );
                stats.pendingRequests = pendingRequestsResult[0].count;
            }
        }

        // Get total users count based on role
        if (activeUser.role === 'System Administrator') {
            // System Administrator can see all users in the company
            const [totalUsersResult] = await pool.query(
                `SELECT COUNT(*) as count
                 FROM users
                 WHERE company_id = ? AND u_status = 'active'`,
                [activeUser.company_id]
            );
            stats.totalUsers = totalUsersResult[0].count;
        } else {
            // Regular users can only see users in their branch
            const [totalUsersResult] = await pool.query(
                `SELECT COUNT(*) as count
                 FROM users
                 WHERE company_id = ? AND branch_id = ? AND u_status = 'active'`,
                [activeUser.company_id, activeUser.branch_id]
            );
            stats.totalUsers = totalUsersResult[0].count;
        }

        // Get revoked users count based on role
        if (activeUser.role === 'System Administrator') {
            // System Administrator can see all revoked users in the company
            const [revokedUsersResult] = await pool.query(
                `SELECT COUNT(*) as count
                 FROM users
                 WHERE company_id = ? AND u_status = 'revoked'`,
                [activeUser.company_id]
            );
            stats.revokedUsers = revokedUsersResult[0].count;
        } else {
            // Check if user has the list_revoked_users privilege
            const [privilegeCheck] = await pool.query(
                `SELECT 1 FROM user_privileges up
                JOIN privileges p ON up.privilege_id = p.privilege_id
                WHERE up.user_id = ? AND p.privilege_name = 'list_revoked_users'`,
                [activeUser.user_id]
            );

            if (privilegeCheck.length > 0) {
                // User with privilege can see revoked users for their branch
                const [revokedUsersResult] = await pool.query(
                    `SELECT COUNT(*) as count
                     FROM users
                     WHERE company_id = ? AND branch_id = ? AND u_status = 'revoked'`,
                    [activeUser.company_id, activeUser.branch_id]
                );
                stats.revokedUsers = revokedUsersResult[0].count;
            }
        }

        // Get approved requests count based on role and privileges
        if (activeUser.role === 'System Administrator') {
            // System Administrator can see all approved requests for the company
            const [approvedRequestsResult] = await pool.query(
                `SELECT COUNT(*) as count
                 FROM permission_requests
                 WHERE company_id = ? AND u_status = 'approved'`,
                [activeUser.company_id]
            );
            stats.approvedRequests = approvedRequestsResult[0].count;
        } else {
            // Check if user has the view_approved_requests privilege
            const [privilegeCheck] = await pool.query(
                `SELECT 1 FROM user_privileges up
                JOIN privileges p ON up.privilege_id = p.privilege_id
                WHERE up.user_id = ? AND p.privilege_name = 'view_approved_requests'`,
                [activeUser.user_id]
            );

            if (privilegeCheck.length > 0) {
                // User with privilege can see approved requests for their branch
                const [approvedRequestsResult] = await pool.query(
                    `SELECT COUNT(*) as count
                     FROM permission_requests
                     WHERE company_id = ? AND branch_id = ? AND u_status = 'approved'`,
                    [activeUser.company_id, activeUser.branch_id]
                );
                stats.approvedRequests = approvedRequestsResult[0].count;
            }
        }

        res.json({
            success: true,
            stats
        });
    } catch (error) {
        console.error('Error fetching sidebar stats:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching sidebar stats',
            error: error.message
        });
    }
});

module.exports = router; 