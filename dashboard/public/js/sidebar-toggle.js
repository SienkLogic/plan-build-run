document.addEventListener('DOMContentLoaded', function() {
  var toggle = document.getElementById('sidebar-toggle');
  var sidebar = document.querySelector('.sidebar');
  if (!toggle || !sidebar) return;

  toggle.addEventListener('click', function() {
    sidebar.classList.toggle('sidebar--open');
  });

  // Close sidebar when a nav link is clicked (mobile)
  sidebar.querySelectorAll('.sidebar__nav-link').forEach(function(link) {
    link.addEventListener('click', function() {
      sidebar.classList.remove('sidebar--open');
    });
  });
});
