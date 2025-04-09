const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const pool = db.pool;

// Display add user page
router.get('/', async (req, res) => {
    try {
        const user = req.session.activeUser;
        
        // Check if user has permission to add users
        if (user.role !== 'System Administrator') {
            const privilegeCheck = await pool.query(
                `SELECT 1 FROM user_privileges up
                JOIN privileges p ON up.privilege_id = p.privilege_id
                WHERE up.user_id = ? AND p.privilege_name = 'add_users'`,
                [user.user_id]
            );

            if (privilegeCheck.length === 0) {
                req.flash('error', 'You do not have permission to add users');
                return res.redirect('/dashboard');
            }
        }

        // Get branches based on user role
        let branchesQuery;
        let branchesParams = [];

        if (user.role === 'System Administrator') {
            // System Administrator can see all branches in their company
            branchesQuery = `
                SELECT b.branch_id, b.b_name
                FROM branches b
                WHERE b.company_id = ?
                ORDER BY b.b_name
            `;
            branchesParams = [user.company_id];
        } else {
            // User with add_users privilege can only see their branch
            branchesQuery = `
                SELECT b.branch_id, b.b_name
                FROM branches b
                WHERE b.branch_id = ?
            `;
            branchesParams = [user.branch_id];
        }

        const [branches] = await pool.query(branchesQuery, branchesParams);

        // Get roles based on user role
        let rolesQuery;
        let rolesParams = [];

        if (user.role === 'System Administrator') {
            // System Administrator can see all roles in their company
            rolesQuery = `
                SELECT r.role_id, r.role_name
                FROM roles r
                WHERE r.for_company = ?
                ORDER BY r.role_name
            `;
            rolesParams = [user.company_id];
        } else {
            // Check if user has the assign_role privilege
            const assignRoleCheck = await pool.query(
                `SELECT 1 FROM user_privileges up
                JOIN privileges p ON up.privilege_id = p.privilege_id
                WHERE up.user_id = ? AND p.privilege_name = 'assign_role'`,
                [user.user_id]
            );

            if (assignRoleCheck.length > 0) {
                // User with assign_role privilege can see all roles in their branch
                rolesQuery = `
                    SELECT r.role_id, r.role_name
                    FROM roles r
                    WHERE r.for_branch = ?
                    ORDER BY r.role_name
                `;
                rolesParams = [user.branch_id];
            } else {
                // User without assign_role privilege can only see their role
                rolesQuery = `
                    SELECT r.role_id, r.role_name
                    FROM roles r
                    WHERE r.role_id = ?
                `;
                rolesParams = [user.role];
            }
        }

        const [roles] = await pool.query(rolesQuery, rolesParams);

        res.render('pages/add-user', { 
            title: 'Add User',
            branches,
            roles,
            activeUser: user
        });
    } catch (error) {
        console.error('Error loading add user page:', error);
        req.flash('error', 'Error loading add user page');
        res.redirect('/dashboard');
    }
});

module.exports = router; 