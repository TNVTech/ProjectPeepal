const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const pool = db.pool;
const axios = require('axios');

// Display active users page
router.get('/', async (req, res) => {
    try {
        const user = req.session.activeUser;
        let query;
        let params = [];

        if (user.role === 'System Administrator') {
            // System Administrator can see all active users in the company
            query = `
                SELECT u.*, r.role_name, b.b_name, c.c_name
                FROM users u
                JOIN roles r ON u.role = r.role_id
                JOIN branches b ON u.branch_id = b.branch_id
                JOIN company c ON b.company_id = c.company_id
                WHERE u.u_status = 'active'
                AND c.company_id = ?
                ORDER BY u.created_at DESC
            `;
            params = [user.company_id];
        } else {
            // Check if user has the list_active_users privilege
            const privilegeCheck = await pool.query(
                `SELECT 1 FROM user_privileges up
                JOIN privileges p ON up.privilege_id = p.privilege_id
                WHERE up.user_id = ? AND p.privilege_name = 'list_active_users'`,
                [user.user_id]
            );

            if (privilegeCheck.length === 0) {
                req.flash('error', 'You do not have permission to view active users');
                return res.redirect('/dashboard');
            }

            // User with privilege can see active users in their branch
            query = `
                SELECT u.*, r.role_name, b.b_name, c.c_name
                FROM users u
                JOIN roles r ON u.role = r.role_id
                JOIN branches b ON u.branch_id = b.branch_id
                JOIN company c ON b.company_id = c.company_id
                WHERE u.u_status = 'active'
                AND u.branch_id = ?
                ORDER BY u.created_at DESC
            `;
            params = [user.branch_id];
        }

        const [users] = await pool.query(query, params);
        res.render('pages/users', { 
            title: 'Active Users',
            users,
            activeUser: user
        });
    } catch (error) {
        console.error('Error fetching active users:', error);
        req.flash('error', 'Error fetching active users');
        res.redirect('/dashboard');
    }
});

// Handle user revocation
router.post('/:userId/revoke', async (req, res) => {
    try {
        const { userId } = req.params;
        const user = req.session.activeUser;

        // Check if user has permission to revoke users
        if (user.role !== 'System Administrator') {
            const privilegeCheck = await pool.query(
                `SELECT 1 FROM user_privileges up
                JOIN privileges p ON up.privilege_id = p.privilege_id
                WHERE up.user_id = ? AND p.privilege_name = 'revoke_user'`,
                [user.user_id]
            );

            if (privilegeCheck.length === 0) {
                req.flash('error', 'You do not have permission to revoke users');
                return res.redirect('/users');
            }
        }

        // Get the user to be revoked
        const [userToRevoke] = await pool.query(
            `SELECT u.*, b.company_id, b.branch_id 
            FROM users u
            JOIN branches b ON u.branch_id = b.branch_id
            WHERE u.user_id = ?`,
            [userId]
        );

        if (userToRevoke.length === 0) {
            req.flash('error', 'User not found');
            return res.redirect('/users');
        }

        // Check if user has permission to revoke this specific user
        if (user.role !== 'System Administrator') {
            if (userToRevoke[0].company_id !== user.company_id || 
                userToRevoke[0].branch_id !== user.branch_id) {
                req.flash('error', 'You can only revoke users from your branch');
                return res.redirect('/users');
            }
        }

        // Update user status to revoked
        await pool.query(
            'UPDATE users SET u_status = ?, updated_at = NOW() WHERE user_id = ?',
            ['revoked', userId]
        );

        req.flash('success', 'User has been revoked successfully');
        res.redirect('/users');
    } catch (error) {
        console.error('Error revoking user:', error);
        req.flash('error', 'Error revoking user');
        res.redirect('/users');
    }
});

module.exports = router; 