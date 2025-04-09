const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const pool = db.pool;

// Add a new user
router.post('/', async (req, res) => {
    try {
        const { display_name, email, branch_id, role } = req.body;
        const user = req.session.activeUser;

        // Validate required fields
        if (!display_name || !email || !branch_id || !role) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        // Check if user has permission to add users
        if (user.role !== 'System Administrator') {
            const privilegeCheck = await pool.query(
                `SELECT 1 FROM user_privileges up
                JOIN privileges p ON up.privilege_id = p.privilege_id
                WHERE up.user_id = ? AND p.privilege_name = 'add_users'`,
                [user.user_id]
            );

            if (privilegeCheck.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: 'You do not have permission to add users'
                });
            }
        }

        // Check if email already exists
        const [existingUser] = await pool.query(
            'SELECT 1 FROM users WHERE email = ?',
            [email]
        );

        if (existingUser.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Email already exists'
            });
        }

        // Check if branch exists and belongs to the company
        const [branchCheck] = await pool.query(
            'SELECT company_id FROM branches WHERE branch_id = ?',
            [branch_id]
        );

        if (branchCheck.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid branch'
            });
        }

        if (user.role !== 'System Administrator' && branchCheck[0].company_id !== user.company_id) {
            return res.status(403).json({
                success: false,
                message: 'You can only add users to your branch'
            });
        }

        // Check if role exists and belongs to the company/branch
        const [roleCheck] = await pool.query(
            'SELECT for_company, for_branch FROM roles WHERE role_id = ?',
            [role]
        );

        if (roleCheck.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid role'
            });
        }

        if (user.role === 'System Administrator') {
            if (roleCheck[0].for_company !== user.company_id) {
                return res.status(403).json({
                    success: false,
                    message: 'You can only assign roles from your company'
                });
            }
        } else {
            // Check if user has the assign_role privilege
            const assignRoleCheck = await pool.query(
                `SELECT 1 FROM user_privileges up
                JOIN privileges p ON up.privilege_id = p.privilege_id
                WHERE up.user_id = ? AND p.privilege_name = 'assign_role'`,
                [user.user_id]
            );

            if (assignRoleCheck.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: 'You do not have permission to assign roles'
                });
            }

            if (roleCheck[0].for_branch !== user.branch_id) {
                return res.status(403).json({
                    success: false,
                    message: 'You can only assign roles from your branch'
                });
            }
        }

        // Insert the new user
        const [result] = await pool.query(
            `INSERT INTO users (
                display_name, 
                email, 
                branch_id, 
                company_id, 
                role, 
                u_status, 
                assigned_by, 
                assigned_time, 
                created_at
            ) VALUES (?, ?, ?, ?, ?, 'active', ?, NOW(), NOW())`,
            [
                display_name,
                email,
                branch_id,
                user.company_id,
                role,
                user.user_id
            ]
        );

        res.json({
            success: true,
            message: 'User added successfully',
            userId: result.insertId
        });
    } catch (error) {
        console.error('Error adding user:', error);
        res.status(500).json({
            success: false,
            message: 'Error adding user',
            error: error.message
        });
    }
});

module.exports = router; 