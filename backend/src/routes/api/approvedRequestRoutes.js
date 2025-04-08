const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const pool = db.pool;

/**
 * @route GET /api/approved-requests
 * @desc Get all approved permission requests
 * @access Private (Admin or users with view_approved_request privilege)
 */
router.get('/', async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.isAuthenticated()) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        // Check if user has activeUser in session
        if (!req.session.activeUser) {
            return res.status(401).json({ success: false, message: 'User session not found' });
        }

        const activeUser = req.session.activeUser;
        let approvedRequests = [];

        // Check if user is a System Administrator
        if (activeUser.role === 'System Administrator') {
            // Get all approved requests for the company
            const [rows] = await pool.query(
                `SELECT pr.*, c.c_name as company_name, b.b_name as branch_name, r.role_name
                 FROM permission_requests pr
                 LEFT JOIN company c ON pr.company_id = c.company_id
                 LEFT JOIN branches b ON pr.branch_id = b.branch_id
                 LEFT JOIN roles r ON pr.role = r.role_id
                 WHERE pr.company_id = ? AND pr.u_status = 'approved',
                 ORDER BY pr.request_id DESC`,
                [activeUser.company_id]
            );
            approvedRequests = rows;
        } else {
            // Check if user has view_approved_request privilege
            const [privilegeRows] = await pool.query(
                `SELECT p.p_name
                 FROM role_privileges rp
                 JOIN privilege p ON rp.privilege_id = p.privilege_id
                 JOIN roles r ON rp.role_id = r.role_id
                 WHERE r.role_name = ? AND p.p_name = 'view_approved_request'`,
                [activeUser.role]
            );

            if (privilegeRows.length === 0) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'You do not have permission to view approved requests' 
                });
            }

            // User has view_approved_request privilege, get approved requests for their branch
            const [rows] = await pool.query(
                `SELECT pr.*, c.c_name as company_name, b.b_name as branch_name, r.role_name
                 FROM permission_requests pr
                 LEFT JOIN company c ON pr.company_id = c.company_id
                 LEFT JOIN branches b ON pr.branch_id = b.branch_id
                 LEFT JOIN roles r ON pr.role = r.role_id
                 WHERE pr.company_id = ? AND pr.branch_id = ? AND pr.u_status = 'approved'
                 ORDER BY pr.request_id DESC`,
                [activeUser.company_id, activeUser.branch_id]
            );
            approvedRequests = rows;
        }

        res.json({ 
            success: true, 
            count: approvedRequests.length,
            approvedRequests 
        });
    } catch (error) {
        console.error('Error fetching approved requests:', error);
        res.status(500).json({ 
            success: false, 
            message: 'An error occurred while fetching approved requests',
            error: error.message
        });
    }
});

module.exports = router; 