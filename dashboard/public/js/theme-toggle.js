/* theme-toggle.js — Toggle light/dark theme via data-bs-theme attribute + localStorage */
(function () {
  'use strict';

  var STORAGE_KEY = 'pbr-theme';

  function getEffectiveTheme() {
    var explicit = document.documentElement.dataset.bsTheme;
    if (explicit === 'light' || explicit === 'dark') return explicit;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function updateIcon(btn, theme) {
    // Show sun when dark (click to go light), moon when light (click to go dark)
    btn.textContent = theme === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19';
    btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  }

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;

    // Apply stored theme (also done in layout-top inline script for flash prevention)
    var stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      document.documentElement.dataset.bsTheme = stored;
    }

    updateIcon(btn, getEffectiveTheme());

    btn.addEventListener('click', function () {
      var current = getEffectiveTheme();
      var next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.bsTheme = next;
      localStorage.setItem(STORAGE_KEY, next);
      updateIcon(btn, next);
    });

    // Update icon if system preference changes and no explicit preference is stored
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      if (!localStorage.getItem(STORAGE_KEY)) {
        updateIcon(btn, getEffectiveTheme());
      }
    });
  });
})();
