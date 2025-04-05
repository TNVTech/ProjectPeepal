const express = require('express');
const router = express.Router();
const permissionController = require('../../controllers/permissioncontroller');

/**
 * @route POST /api/permission/check
 * @desc Check if a user exists and handle permission request if needed
 * @access Public
 */
router.post('/check', async (req, res) => {
    try {
        const userData = req.body;
        
        if (!userData || !userData.email) {
            return res.status(400).json({ 
                status: 'error', 
                message: 'User data is required' 
            });
        }
        
        const result = await permissionController.checkUserAndHandlePermission(userData);
        res.json(result);
    } catch (error) {
        console.error('Error in permission check route:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'Server error while checking user permission' 
        });
    }
});

/**
 * @route GET /api/permission/requests
 * @desc Get all permission requests
 * @access Private (Admin only)
 */
router.get('/requests', async (req, res) => {
    try {
        // TODO: Add admin authentication check
        const requests = await permissionController.getAllPermissionRequests();
        res.json({
            status: 'success',
            data: requests
        });
    } catch (error) {
        console.error('Error getting permission requests:', error);
        res.status(500).json({
            status: 'error',
            message: 'An error occurred while getting permission requests',
            error: error.message
        });
    }
});

/**
 * @route PUT /api/permission/requests/:requestId
 * @desc Update permission request status
 * @access Private (Admin only)
 */
router.put('/requests/:requestId', async (req, res) => {
    try {
        // TODO: Add admin authentication check
        const { requestId } = req.params;
        const { status, updatedBy } = req.body;
        
        if (!status || !['approved', 'rejected'].includes(status)) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid status. Must be either "approved" or "rejected"'
            });
        }
        
        if (!updatedBy) {
            return res.status(400).json({
                status: 'error',
                message: 'updatedBy is required'
            });
        }
        
        const result = await permissionController.updatePermissionRequestStatus(
            parseInt(requestId),
            status,
            parseInt(updatedBy)
        );
        
        res.json(result);
    } catch (error) {
        console.error('Error updating permission request:', error);
        res.status(500).json({
            status: 'error',
            message: 'An error occurred while updating the permission request',
            error: error.message
        });
    }
});

module.exports = router;
