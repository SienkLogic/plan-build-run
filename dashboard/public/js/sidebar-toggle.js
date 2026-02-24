// sidebar-toggle.js — Tabler vertical navbar toggle shim
// Tabler's Bootstrap JS handles collapse via data-bs-toggle="collapse".
// This file remains for the header button (#sidebar-toggle) which triggers
// the .navbar-vertical collapse on mobile.
document.addEventListener('DOMContentLoaded', function() {
  var toggle = document.getElementById('sidebar-toggle');
  var sidebarMenu = document.getElementById('sidebar-menu');
  if (!toggle || !sidebarMenu) return;
  toggle.addEventListener('click', function() {
    sidebarMenu.classList.toggle('show');
  });
});
