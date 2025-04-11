const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const pool = db.pool;
const axios = require('axios');

// Display revoked users page
router.get('/', async (req, res) => {
    try {
        const user = req.session.activeUser;
        let query;
        let params = [];

        if (user.role === 'System Administrator') {
            // System Administrator can see all revoked users in the company
            query = `
                SELECT u.*, r.role_name, r.role_id, b.b_name, c.c_name
                FROM users u
                JOIN roles r ON u.role = r.role_id
                JOIN branches b ON u.branch_id = b.branch_id
                JOIN company c ON b.company_id = c.company_id
                WHERE u.u_status = 'revoked'
                AND c.company_id = ?
                ORDER BY u.updated_at DESC
            `;
            params = [user.company_id];
        } else {
            // Check if user has the list_revoked_users privilege
            const privilegeCheck = await pool.query(
                `SELECT 1 FROM user_privileges up
                JOIN privileges p ON up.privilege_id = p.privilege_id
                WHERE up.user_id = ? AND p.privilege_name = 'list_revoked_users'`,
                [user.user_id]
            );

            if (privilegeCheck.length === 0) {
                req.flash('error', 'You do not have permission to view revoked users');
                return res.redirect('/dashboard');
            }

            // User with privilege can see revoked users in their branch
            query = `
                SELECT u.*, r.role_name, r.role_id, b.b_name, c.c_name
                FROM users u
                JOIN roles r ON u.role = r.role_id
                JOIN branches b ON u.branch_id = b.branch_id
                JOIN company c ON b.company_id = c.company_id
                WHERE u.u_status = 'revoked'
                AND u.branch_id = ?
                ORDER BY u.updated_at DESC
            `;
            params = [user.branch_id];
        }

        const [users] = await pool.query(query, params);
        res.render('pages/revoked-users', { 
            title: 'Revoked Users',
            users,
            activeUser: user
        });
    } catch (error) {
        console.error('Error fetching revoked users:', error);
        req.flash('error', 'Error fetching revoked users');
        res.redirect('/dashboard');
    }
});

// Handle user reactivation
router.post('/:userId/reactivate', async (req, res) => {
    try {
        const { userId } = req.params;
        const { branch_id, role } = req.body;
        const user = req.session.activeUser;

        // Check if user has permission to reactivate users
        if (user.role !== 'System Administrator') {
            const privilegeCheck = await pool.query(
                `SELECT 1 FROM user_privileges up
                JOIN privileges p ON up.privilege_id = p.privilege_id
                WHERE up.user_id = ? AND p.privilege_name = 'reactivate_user'`,
                [user.user_id]
            );

            if (privilegeCheck.length === 0) {
                req.flash('error', 'You do not have permission to reactivate users');
                return res.redirect('/revoked-users');
            }
        }

        // Get the user to be reactivated
        const [userToReactivate] = await pool.query(
            `SELECT u.*, b.company_id, b.branch_id 
            FROM users u
            JOIN branches b ON u.branch_id = b.branch_id
            WHERE u.user_id = ?`,
            [userId]
        );

        if (userToReactivate.length === 0) {
            req.flash('error', 'User not found');
            return res.redirect('/revoked-users');
        }

        // Check if user has permission to reactivate this specific user
        if (user.role !== 'System Administrator') {
            if (userToReactivate[0].company_id !== user.company_id || 
                userToReactivate[0].branch_id !== user.branch_id) {
                req.flash('error', 'You can only reactivate users from your branch');
                return res.redirect('/revoked-users');
            }
        }

        // Check permissions for branch and role updates
        if (branch_id || role) {
            if (user.role !== 'System Administrator') {
                const [privileges] = await pool.query(
                    `SELECT p.privilege_name 
                     FROM user_privileges up
                     JOIN privileges p ON up.privilege_id = p.privilege_id
                     WHERE up.user_id = ?`,
                    [user.user_id]
                );

                const userPrivileges = privileges.map(p => p.privilege_name);

                if (branch_id && !userPrivileges.includes('assign_branch')) {
                    req.flash('error', 'You do not have permission to change branch assignments');
                    return res.redirect('/revoked-users');
                }

                if (role && !userPrivileges.includes('assign_role')) {
                    req.flash('error', 'You do not have permission to change role assignments');
                    return res.redirect('/revoked-users');
                }

                // For non-admin users, verify the user belongs to their branch
                if (userToReactivate[0].company_id !== user.company_id || 
                    userToReactivate[0].branch_id !== user.branch_id) {
                    req.flash('error', 'You can only update users from your branch');
                    return res.redirect('/revoked-users');
                }
            }
        }

        // Build update query dynamically
        let updateFields = ['u_status = ?'];
        let updateValues = ['active'];

        if (branch_id) {
            updateFields.push('branch_id = ?');
            updateValues.push(branch_id);
        }

        if (role) {
            updateFields.push('role = ?');
            updateValues.push(role);
        }

        updateFields.push('updated_at = NOW()');
        updateValues.push(userId);

        // Update user
        await pool.query(
            `UPDATE users SET ${updateFields.join(', ')} WHERE user_id = ?`,
            updateValues
        );

        req.flash('success', 'User has been reactivated successfully');
        res.redirect('/revoked-users');
    } catch (error) {
        console.error('Error reactivating user:', error);
        req.flash('error', 'Error reactivating user');
        res.redirect('/revoked-users');
    }
});

module.exports = router; 