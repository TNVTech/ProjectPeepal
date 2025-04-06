const express = require('express');
const router = express.Router();
const db = require('../../config/db');

/**
 * @route GET /api/pending-requests
 * @desc Get pending permission requests based on user role and privileges
 * @access Private
 */
router.get('/', async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.isAuthenticated()) {
            return res.status(401).json({
                status: 'error',
                message: 'Unauthorized access'
            });
        }

        const activeUser = req.session.activeUser;
        
        if (!activeUser) {
            return res.status(401).json({
                status: 'error',
                message: 'User session not found'
            });
        }

        let query = '';
        let params = [];

        // Check if user is a system administrator
        if (activeUser.role === 'System Administrator') {
            // Get all pending requests for the company
            query = `
                SELECT pr.*, c.c_name as company_name,r.role_name
                FROM permission_requests pr
                LEFT JOIN company c ON pr.company_id = c.company_id
                LEFT JOIN roles r ON pr.role = r.role_id
                WHERE pr.company_id = ? AND pr.u_status = 'pending'
                ORDER BY pr.request_id DESC
            `;
            params = [activeUser.company_id];
        } else {
            // Check if user has list_requests privilege
            const [privilegeRows] = await db.pool.query(
                `SELECT rp.privilege_id, p.privilege_name
                 FROM role_privileges rp
                 JOIN privileges p ON rp.privilege_id = p.privilege_id
                 JOIN roles r ON rp.role_id = r.role_id
                 WHERE r.role_name = ? AND p.privilege_name = 'list_requests'`,
                [activeUser.role]
            );

            if (privilegeRows.length > 0) {
                // User has list_requests privilege, get pending requests for their branch
                query = `
                    SELECT pr.*, c.c_name as company_name, b.b_name as branch_name, r.role_name
                    FROM permission_requests pr
                    LEFT JOIN company c ON pr.company_id = c.company_id
                    LEFT JOIN branches b ON pr.branch_id = b.branch_id
                    LEFT JOIN roles r ON pr.role = r.role_id
                    WHERE pr.company_id = ? AND pr.branch_id = ? AND pr.u_status = 'pending'
                    ORDER BY pr.request_id DESC
                `;
                params = [activeUser.company_id, activeUser.branch_id];
            } else {
                // User doesn't have list_requests privilege
                return res.status(403).json({
                    status: 'error',
                    message: 'You do not have permission to view pending requests'
                });
            }
        }

        // Execute the query
        const [rows] = await db.pool.query(query, params);
        
        res.json({
            status: 'success',
            data: rows
        });
    } catch (error) {
        console.error('Error getting pending requests:', error);
        res.status(500).json({
            status: 'error',
            message: 'An error occurred while getting pending requests',
            error: error.message
        });
    }
});

/**
 * @route GET /api/pending-requests/count
 * @desc Get count of pending permission requests based on user role and privileges
 * @access Private
 */
router.get('/count', async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.isAuthenticated()) {
            return res.status(401).json({
                status: 'error',
                message: 'Unauthorized access'
            });
        }

        const activeUser = req.session.activeUser;
        
        if (!activeUser) {
            return res.status(401).json({
                status: 'error',
                message: 'User session not found'
            });
        }

        let query = '';
        let params = [];

        // Check if user is a system administrator
        if (activeUser.role === 'System Administrator') {
            // Get count of all pending requests for the company
            query = `
                SELECT COUNT(*) as count
                FROM permission_requests
                WHERE company_id = ? AND u_status = 'pending'
            `;
            params = [activeUser.company_id];
        } else {
            // Check if user has list_requests privilege
            const [privilegeRows] = await db.pool.query(
                `SELECT rp.privilege_id, p.privilege_name
                 FROM role_privileges rp
                 JOIN privileges p ON rp.privilege_id = p.privilege_id
                 JOIN roles r ON rp.role_id = r.role_id
                 WHERE r.role_name = ? AND p.privilege_name = 'list_requests'`,
                [activeUser.role]
            );

            if (privilegeRows.length > 0) {
                // User has list_requests privilege, get count of pending requests for their branch
                query = `
                    SELECT COUNT(*) as count
                    FROM permission_requests
                    WHERE company_id = ? AND branch_id = ? AND u_status = 'pending'
                `;
                params = [activeUser.company_id, activeUser.branch_id];
            } else {
                // User doesn't have list_requests privilege
                return res.status(403).json({
                    status: 'error',
                    message: 'You do not have permission to view pending requests'
                });
            }
        }

        // Execute the query
        const [rows] = await db.pool.query(query, params);
        
        res.json({
            status: 'success',
            count: rows[0].count
        });
    } catch (error) {
        console.error('Error getting pending requests count:', error);
        res.status(500).json({
            status: 'error',
            message: 'An error occurred while getting pending requests count',
            error: error.message
        });
    }
});

module.exports = router; 