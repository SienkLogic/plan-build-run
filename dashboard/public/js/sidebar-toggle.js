// Mobile sidebar toggle with backdrop overlay
document.addEventListener('DOMContentLoaded', function() {
  var toggle = document.querySelector('.sidebar-toggle');
  var sidebar = document.querySelector('.sidebar');
  if (!toggle || !sidebar) return;

  // Create backdrop element
  var backdrop = document.createElement('div');
  backdrop.className = 'sidebar-backdrop';
  document.body.appendChild(backdrop);

  function closeSidebar() {
    sidebar.classList.remove('open');
    backdrop.classList.remove('open');
  }

  function toggleSidebar() {
    sidebar.classList.toggle('open');
    backdrop.classList.toggle('open');
  }

  toggle.addEventListener('click', toggleSidebar);
  backdrop.addEventListener('click', closeSidebar);

  // Close sidebar when a nav link is clicked (mobile)
  var navLinks = sidebar.querySelectorAll('a');
  navLinks.forEach(function(link) {
    link.addEventListener('click', function() {
      if (window.innerWidth <= 768) {
        closeSidebar();
      }
    });
  });
});
