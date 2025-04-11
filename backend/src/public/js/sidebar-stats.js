/**
 * Sidebar Stats Updater
 * Fetches and updates the sidebar stats on all pages
 */
document.addEventListener('DOMContentLoaded', function() {
    // Function to update sidebar stats
    function updateSidebarStats() {
        fetch('/api/stats/sidebar', {
            method: 'GET',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                // Update pending requests badge
                const pendingRequestsBadge = document.getElementById('pending-requests-badge');
                if (pendingRequestsBadge) {
                    pendingRequestsBadge.textContent = data.stats.pendingRequests;
                    
                    // Show or hide badge based on count
                    if (data.stats.pendingRequests > 0) {
                        pendingRequestsBadge.classList.remove('d-none');
                    } else {
                        pendingRequestsBadge.classList.add('d-none');
                    }
                }
                
                // Update total users badge
                const totalUsersBadge = document.getElementById('total-users-badge');
                if (totalUsersBadge) {
                    totalUsersBadge.textContent = data.stats.totalUsers;
                }
                
                // Update revoked users badge
                const revokedUsersBadge = document.getElementById('revoked-users-badge');
                if (revokedUsersBadge) {
                    revokedUsersBadge.textContent = data.stats.revokedUsers;
                    
                    // Show or hide badge based on count
                    if (data.stats.revokedUsers > 0) {
                        revokedUsersBadge.classList.remove('d-none');
                    } else {
                        revokedUsersBadge.classList.add('d-none');
                    }
                }
                
                console.log('Sidebar stats updated successfully');
            } else {
                console.error('Failed to update sidebar stats:', data.message);
            }
        })
        .catch(error => {
            console.error('Error updating sidebar stats:', error);
        });
    }
    
    // Update stats immediately when page loads
    updateSidebarStats();
    
    // Update stats every 5 minutes
    setInterval(updateSidebarStats, 5 * 60 * 1000);
}); 