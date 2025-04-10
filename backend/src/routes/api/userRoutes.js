const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const pool = db.pool;
const axios = require('axios');

// Get active users based on role and privileges
router.get('/active', async (req, res) => {
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
                return res.status(403).json({ 
                    success: false, 
                    message: 'You do not have permission to view active users' 
                });
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
        res.json({ success: true, users });
    } catch (error) {
        console.error('Error fetching active users:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching active users',
            error: error.message 
        });
    }
});

// Revoke a user
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
                return res.status(403).json({ 
                    success: false, 
                    message: 'You do not have permission to revoke users' 
                });
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
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        // Check if user has permission to revoke this specific user
        if (user.role !== 'System Administrator') {
            if (userToRevoke[0].company_id !== user.company_id || 
                userToRevoke[0].branch_id !== user.branch_id) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'You can only revoke users from your branch' 
                });
            }
        }

        // Update user status to revoked
        await pool.query(
            'UPDATE users SET u_status = ?, updated_at = NOW() WHERE user_id = ?',
            ['revoked', userId]
        );

        res.json({ 
            success: true, 
            message: 'User has been revoked successfully' 
        });
    } catch (error) {
        console.error('Error revoking user:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error revoking user',
            error: error.message 
        });
    }
});

// Update user details
router.post('/:userId/update', async (req, res) => {
    try {
        const { userId } = req.params;
        const { displayName, branch_id, role } = req.body;
        const user = req.session.activeUser;

        // Get the user to be updated
        const [userToUpdate] = await pool.query(
            `SELECT u.*, b.company_id, b.branch_id 
            FROM users u
            JOIN branches b ON u.branch_id = b.branch_id
            WHERE u.user_id = ?`,
            [userId]
        );

        if (userToUpdate.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
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
                    return res.status(403).json({
                        success: false,
                        message: 'You do not have permission to change branch assignments'
                    });
                }

                if (role && !userPrivileges.includes('assign_role')) {
                    return res.status(403).json({
                        success: false,
                        message: 'You do not have permission to change role assignments'
                    });
                }

                // For non-admin users, verify the user belongs to their branch
                if (userToUpdate[0].company_id !== user.company_id || 
                    userToUpdate[0].branch_id !== user.branch_id) {
                    return res.status(403).json({
                        success: false,
                        message: 'You can only update users from your branch'
                    });
                }
            }
        }

        // Build update query dynamically
        let updateFields = ['display_name = ?'];
        let updateValues = [displayName];

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

        res.json({
            success: true,
            message: 'User details updated successfully'
        });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating user details',
            error: error.message
        });
    }
});

module.exports = router; 