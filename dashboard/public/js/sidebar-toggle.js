document.addEventListener('DOMContentLoaded', function() {
  var toggle = document.getElementById('sidebar-toggle');
  var sidebar = document.querySelector('.sidebar');
  if (!toggle || !sidebar) return;

  toggle.addEventListener('click', function() {
    sidebar.classList.toggle('sidebar--open');
    document.body.classList.toggle('sidebar-visible');
  });

  // Close sidebar when a nav link is clicked (mobile)
  sidebar.querySelectorAll('.sidebar__nav-link').forEach(function(link) {
    link.addEventListener('click', function() {
      sidebar.classList.remove('sidebar--open');
      document.body.classList.remove('sidebar-visible');
    });
  });

  // Close sidebar when clicking the backdrop
  document.addEventListener('click', function(e) {
    if (!sidebar.classList.contains('sidebar--open')) return;
    if (sidebar.contains(e.target) || toggle.contains(e.target)) return;
    sidebar.classList.remove('sidebar--open');
    document.body.classList.remove('sidebar-visible');
  });
});
