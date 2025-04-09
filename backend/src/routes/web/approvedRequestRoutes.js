const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const pool = db.pool;
const axios = require('axios');

/**
 * @route GET /approved-requests
 * @desc Render the approved requests page
 * @access Private (Admin or users with view_approved_request privilege)
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

        // Check if user is a System Administrator or has view_approved_request privilege
        const activeUser = req.session.activeUser;
        if (activeUser.role !== 'System Administrator' && 
            (!res.locals.userPrivileges || !res.locals.userPrivileges.includes('view_approved_request'))) {
            return res.status(403).render('error', {
                message: 'You do not have permission to view the approved requests page',
                error: {
                    status: 403,
                    stack: ''
                }
            });
        }

        let approvedRequests = [];
        let approvedCount = 0;

        // Check if user is a system administrator
        if (activeUser.role === 'System Administrator') {
            // Get all approved requests for the company
            const [rows] = await pool.query(
                `SELECT pr.*, c.c_name as company_name, b.b_name as branch_name, r.role_name
                 FROM permission_requests pr
                 LEFT JOIN company c ON pr.company_id = c.company_id
                 LEFT JOIN branches b ON pr.branch_id = b.branch_id
                 LEFT JOIN roles r ON pr.role = r.role_id
                 WHERE pr.company_id = ? AND pr.u_status = 'approved'
                 ORDER BY pr.request_id DESC`,
                [activeUser.company_id]
            );
            approvedRequests = rows;
            approvedCount = rows.length;
        } else {
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
            approvedCount = rows.length;
        }

        res.render('pages/approved-requests', {
            title: 'Approved Requests',
            path: '/approved-requests',
            approvedRequests,
            approvedCount,
            activeUser
        });
    } catch (error) {
        console.error('Error rendering approved requests page:', error);
        res.status(500).render('error', {
            message: 'An error occurred while loading the approved requests page',
            error: {
                status: 500,
                stack: error.stack
            }
        });
    }
});

module.exports = router; 