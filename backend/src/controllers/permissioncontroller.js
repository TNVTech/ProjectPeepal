const permissionModel = require('../models/permissionmodel');
const db = require('../config/db');

/**
 * Check if a user exists and handle permission request if needed
 * @param {Object} user - User data from SSO
 * @returns {Promise<Object>} - User status information
 */
const checkUserAndHandlePermission = async (user) => {
    try {
        console.log('Checking user and handling permission for:', {
            email: user.email,
            displayName: user.displayName,
            companyName: user.companyName,
            officeLocation: user.officeLocation
        });
        
        if (!user || !user.email) {
            console.error('Invalid user data:', user);
            return {
                status: 'error',
                message: 'Invalid user data'
            };
        }
        
        // First check if user exists in the users table
        const [userRows] = await db.pool.query(
            `SELECT u.*, r.role_name 
             FROM users u
             JOIN roles r ON u.role_id = r.role_id
             WHERE u.email = ?`,
            [user.email]
        );
        
        if (userRows.length > 0) {
            const userStatus = userRows[0].u_status;
            if (userStatus === 'active') {
                // User exists and is active, grant access
                console.log('User exists in the users table and is active, granting access');
                console.log('User role:', userRows[0].role_name);
                return {
                    status: 'success',
                    message: 'User exists in the system',
                    user: {
                        ...user,
                        role: userRows[0].role_name
                    }
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
            const [requestRows] = await db.pool.query(
                'SELECT * FROM permission_requests WHERE email = ?',
                [user.email]
            );
            
            if (requestRows.length > 0) {
                const request = requestRows[0];
                // Request exists, check its status
                if (request.u_status === 'approved') {
                    console.log('Request is approved, moving user to users table');
                    
                    // Get the basic role ID
                    const [roleRows] = await db.pool.query(
                        'SELECT role_id, role_name FROM roles WHERE role_name = ?',
                        ['basic']
                    );
                    
                    if (roleRows.length === 0) {
                        console.error('Basic role not found');
                        return {
                            status: 'error',
                            message: 'Basic role not found in the system'
                        };
                    }
                    
                    const roleId = roleRows[0].role_id;
                    const roleName = roleRows[0].role_name;
                    
                    // Insert user into users table
                    await db.pool.query(
                        `INSERT INTO users (
                            email, 
                            display_name, 
                            company_id, 
                            branch_id, 
                            role_id, 
                            u_status
                        ) VALUES (?, ?, ?, ?, ?, ?)`,
                        [
                            request.email,
                            request.display_name,
                            request.company_id,
                            request.branch_id,
                            roleId,
                            'active'
                        ]
                    );
                    
                    // Update permission request status to processed
                    await db.pool.query(
                        'UPDATE permission_requests SET u_status = ? WHERE email = ?',
                        ['processed', request.email]
                    );
                    
                    console.log('User successfully moved to users table with role:', roleName);
                    return {
                        status: 'success',
                        message: 'Your account has been approved and activated',
                        user: {
                            email: request.email,
                            displayName: request.display_name,
                            companyId: request.company_id,
                            branchId: request.branch_id,
                            role: roleName
                        }
                    };
                } else if (request.u_status === 'rejected') {
                    console.log('Request was rejected');
                    return {
                        status: 'rejected',
                        message: 'Your approval request has been rejected. Please contact the administrator for more information.',
                        user: user
                    };
                } else if (request.u_status === 'revoked') {
                    console.log('Request was revoked');
                    return {
                        status: 'revoked',
                        message: 'Your access has been revoked. Please contact the administrator.',
                        user: user
                    };
                } else {
                    // Request is pending
                    console.log('Request is pending approval');
                    return {
                        status: 'pending',
                        message: 'Your login was successful, but your request is pending approval',
                        request: request
                    };
                }
            } else {
                // Create a new permission request
                console.log('Creating new permission request for:', {
                    email: user.email,
                    displayName: user.displayName,
                    companyName: user.companyName,
                    officeLocation: user.officeLocation
                });
                
                // Look up company and branch information
                const [companyRows] = await db.pool.query(
                    'SELECT company_id FROM company WHERE c_name = ?',
                    [user.companyName]
                );
                
                if (companyRows.length === 0) {
                    console.error('Company not found:', user.companyName);
                    return {
                        status: 'error',
                        message: 'Your company is not registered in the system. Please contact the administrator.',
                        error: 'Company not found'
                    };
                }
                
                const [branchRows] = await db.pool.query(
                    'SELECT branch_id FROM branches WHERE b_name = ?',
                    [user.officeLocation]
                );
                
                if (branchRows.length === 0) {
                    console.error('Branch not found:', user.officeLocation);
                    return {
                        status: 'error',
                        message: 'Your office location is not registered in the system. Please contact the administrator.',
                        error: 'Branch not found'
                    };
                }
                
                const companyId = companyRows[0].company_id;
                const branchId = branchRows[0].branch_id;
                
                console.log('Found company and branch:', {
                    companyName: user.companyName,
                    companyId: companyId,
                    officeLocation: user.officeLocation,
                    branchId: branchId
                });
                
                const newRequest = await permissionModel.addPermissionRequest({
                    ...user,
                    company_id: companyId,
                    branch_id: branchId
                });
                
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
 * @param {string} status - The new status (approved, rejected, revoked)
 * @param {number} updatedBy - The ID of the user updating the request
 * @returns {Promise<Object>} - The result of the update
 */
const updatePermissionRequestStatus = async (requestId, status, updatedBy) => {
    try {
        console.log(`Updating permission request ${requestId} to status: ${status}`);
        
        if (!['approved', 'rejected', 'revoked'].includes(status)) {
            return {
                status: 'error',
                message: 'Invalid status. Must be either "approved", "rejected", or "revoked"'
            };
        }
        
        // Get the permission request details
        const [requestRows] = await db.pool.query(
            'SELECT * FROM permission_requests WHERE request_id = ?',
            [requestId]
        );
        
        if (requestRows.length === 0) {
            return {
                status: 'error',
                message: 'Permission request not found'
            };
        }
        
        const request = requestRows[0];
        
        if (status === 'approved') {
            // Get the basic role ID
            const [roleRows] = await db.pool.query(
                'SELECT role_id FROM roles WHERE role_name = ?',
                ['basic']
            );
            
            if (roleRows.length === 0) {
                return {
                    status: 'error',
                    message: 'Basic role not found in the system'
                };
            }
            
            const roleId = roleRows[0].role_id;
            
            // Create user in users table
            await db.pool.query(
                `INSERT INTO users (
                    email, 
                    display_name, 
                    company_id, 
                    branch_id, 
                    role_id, 
                    u_status
                ) VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    request.email,
                    request.display_name,
                    request.company_id,
                    request.branch_id,
                    roleId,
                    'active'
                ]
            );
        }
        
        // Update the permission request status
        const updatedRequest = await permissionModel.updatePermissionRequestStatus(requestId, status, updatedBy);
        
        return {
            status: 'success',
            message: status === 'approved' 
                ? 'Permission request approved and user added to the system' 
                : `Permission request ${status}`,
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
