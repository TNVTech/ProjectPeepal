const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const pool = db.pool;

// Get all rejected requests
router.get('/', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT pr.*, c.c_name as company_name, b.b_name as branch_name, r.role_name
             FROM permission_requests pr
             LEFT JOIN company c ON pr.company_id = c.company_id
             LEFT JOIN branches b ON pr.branch_id = b.branch_id
             LEFT JOIN roles r ON pr.role = r.role_id
             WHERE pr.u_status = 'rejected'
             ORDER BY pr.request_id DESC`
        );
        res.json(rows);
    } catch (error) {
        console.error('Error fetching rejected requests:', error);
        res.status(500).json({ error: 'Failed to fetch rejected requests' });
    }
});

// Get rejected requests for a specific branch
router.get('/branch/:branchId', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT pr.*, c.c_name as company_name, b.b_name as branch_name, r.role_name
             FROM permission_requests pr
             LEFT JOIN company c ON pr.company_id = c.company_id
             LEFT JOIN branches b ON pr.branch_id = b.branch_id
             LEFT JOIN roles r ON pr.role = r.role_id
             WHERE pr.branch_id = ? AND pr.u_status = 'rejected'
             ORDER BY pr.request_id DESC`,
            [req.params.branchId]
        );
        res.json(rows);
    } catch (error) {
        console.error('Error fetching branch rejected requests:', error);
        res.status(500).json({ error: 'Failed to fetch branch rejected requests' });
    }
});

// Reapprove a rejected request
router.post('/:requestId/reapprove', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Get the request details
        const [requests] = await connection.query(
            'SELECT * FROM permission_requests WHERE request_id = ?',
            [req.params.requestId]
        );

        if (requests.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Request not found' });
        }

        const request = requests[0];

        // Update the request status to approved
        await connection.query(
            'UPDATE permission_requests SET u_status = ?, updated_at = NOW() WHERE request_id = ?',
            ['approved', req.params.requestId]
        );

        // Insert into users table
        await connection.query(
            `INSERT INTO users (
                displayName, email, company_id, branch_id, role, u_status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, 'active', NOW(), NOW())`,
            [
                request.displayName,
                request.email,
                request.company_id,
                request.branch_id,
                request.role
            ]
        );

        await connection.commit();
        res.json({ message: 'Request reapproved successfully' });
    } catch (error) {
        await connection.rollback();
        console.error('Error reapproving request:', error);
        res.status(500).json({ error: 'Failed to reapprove request' });
    } finally {
        connection.release();
    }
});

module.exports = router; 