const permissionModel = require('../models/permissionmodel');
const db = require('../config/db');

/**
 * Check if a user exists and handle permission request if needed
 * @param {Object} user - User data from SSO
 * @returns {Promise<Object>} - User status information
 */
const checkUserAndHandlePermission = async (user) => {
    try {
        console.log('Checking user and handling permission for:', user);
        
        if (!user || !user.email) {
            console.error('Invalid user data:', user);
            return {
                status: 'error',
                message: 'Invalid user data'
            };
        }
        
        // First check if user exists in the users table
        const [userRows] = await db.pool.query(
            'SELECT user_id, u_status FROM users WHERE email = ?',
            [user.email]
        );
        
        if (userRows.length > 0) {
            const userStatus = userRows[0].u_status;
            if (userStatus === 'active') {
                // User exists and is active, grant access
                console.log('User exists in the users table and is active, granting access');
                return {
                    status: 'success',
                    message: 'User exists in the system',
                    user: user
                };
            } else if (userStatus === 'revoked') {
                // User exists but access is revoked
                console.log('User exists but access is revoked');
                return {
                    status: 'revoked',
                    message: 'Your access has been revoked. Please contact the administrator.',
                    user: user
                };
            } else {
                // User exists but has an unknown status
                console.log('User exists but has an unknown status:', userStatus);
                return {
                    status: 'error',
                    message: 'Your account status is unknown. Please contact the administrator.',
                    user: user
                };
            }
        } else {
            // User doesn't exist in the users table, check permission requests
            console.log('User does not exist in the users table, checking permission requests');
            const existingRequest = await permissionModel.getPermissionRequestByEmail(user.email);
            
            if (existingRequest) {
                // Request exists, check its status
                if (existingRequest.u_status === 'rejected') {
                    console.log('Request was rejected');
                    return {
                        status: 'rejected',
                        message: 'Your approval request has been rejected. Please contact the administrator for more information.',
                        user: user
                    };
                } else {
                    // Request is pending
                    console.log('Request is pending approval');
                    return {
                        status: 'pending',
                        message: 'Your login was successful, but your request is pending approval',
                        request: existingRequest
                    };
                }
            } else {
                // Create a new permission request
                console.log('Creating new permission request');
                const newRequest = await permissionModel.addPermissionRequest(user);
                
                console.log('New permission request created, returning pending status');
                return {
                    status: 'pending',
                    message: 'Your login was successful, but your request is pending approval',
                    request: newRequest
                };
            }
        }
    } catch (error) {
        console.error('Error in checkUserAndHandlePermission:', error);
        return {
            status: 'error',
            message: 'An error occurred while checking user permission',
            error: error.message
        };
    }
};

/**
 * Update permission request status
 * @param {number} requestId - The ID of the request to update
 * @param {string} status - The new status (approved, rejected)
 * @param {number} updatedBy - The ID of the user updating the request
 * @returns {Promise<Object>} - The result of the update
 */
const updatePermissionRequestStatus = async (requestId, status, updatedBy) => {
    try {
        console.log(`Updating permission request ${requestId} to status: ${status}`);
        
        if (!['approved', 'rejected'].includes(status)) {
            return {
                status: 'error',
                message: 'Invalid status. Must be either "approved" or "rejected"'
            };
        }
        
        const updatedRequest = await permissionModel.updatePermissionRequestStatus(requestId, status, updatedBy);
        
        if (!updatedRequest) {
            return {
                status: 'error',
                message: 'Permission request not found'
            };
        }
        
        return {
            status: 'success',
            message: status === 'approved' 
                ? 'Permission request approved and user added to the system' 
                : 'Permission request rejected',
            request: updatedRequest
        };
    } catch (error) {
        console.error('Error updating permission request status:', error);
        return {
            status: 'error',
            message: 'An error occurred while updating the permission request',
            error: error.message
        };
    }
};

/**
 * Get all permission requests
 * @returns {Promise<Array>} - List of permission requests
 */
const getAllPermissionRequests = async () => {
    try {
        return await permissionModel.getAllPermissionRequests();
    } catch (error) {
        console.error('Error getting all permission requests:', error);
        throw error;
    }
};

module.exports = {
    checkUserAndHandlePermission,
    updatePermissionRequestStatus,
    getAllPermissionRequests
};
