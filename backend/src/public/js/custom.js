// Custom JavaScript for the dashboard

$(document).ready(function() {
    // Initialize tooltips
    $('[data-toggle="tooltip"]').tooltip();

    // Handle sidebar collapse
    $('[data-widget="pushmenu"]').on('click', function(e) {
        e.preventDefault();
        $('body').toggleClass('sidebar-collapse');
    });

    // Handle fullscreen toggle
    $('[data-widget="fullscreen"]').on('click', function(e) {
        e.preventDefault();
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    });

    // Handle dropdown menus
    $('.dropdown-toggle').dropdown();

    // Example chart initialization (using Chart.js)
    if (document.getElementById('activity-chart')) {
        const ctx = document.getElementById('activity-chart').getContext('2d');
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                datasets: [{
                    label: 'User Activity',
                    data: [12, 19, 3, 5, 2, 3],
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
    }

    // Handle notifications
    $('.notification-item').on('click', function(e) {
        e.preventDefault();
        const notificationId = $(this).data('notification-id');
        // Handle notification click (e.g., mark as read)
        console.log('Notification clicked:', notificationId);
    });

    // Handle messages
    $('.message-item').on('click', function(e) {
        e.preventDefault();
        const messageId = $(this).data('message-id');
        // Handle message click (e.g., open message)
        console.log('Message clicked:', messageId);
    });

    // Auto-hide alerts after 5 seconds
    $('.alert').delay(5000).fadeOut(500);

    // Handle user profile dropdown
    $('.user-profile-dropdown').on('click', function(e) {
        e.preventDefault();
        $(this).next('.dropdown-menu').toggleClass('show');
    });

    // Close dropdowns when clicking outside
    $(document).on('click', function(e) {
        if (!$(e.target).closest('.dropdown').length) {
            $('.dropdown-menu').removeClass('show');
        }
    });
}); 