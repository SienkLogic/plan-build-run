(function () {
  'use strict';

  var STORAGE_KEY = 'pbr-theme';
  var root = document.documentElement;

  // Apply saved or system preference immediately to prevent flash
  var saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    root.setAttribute('data-theme', saved);
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    root.setAttribute('data-theme', 'dark');
  }

  function getEffectiveTheme() {
    return root.getAttribute('data-theme') || 'light';
  }

  function updateIcon(btn, theme) {
    // Sun when dark (click to go light), moon when light (click to go dark)
    btn.querySelector('.theme-btn__icon').textContent = theme === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19';
    btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  }

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;

    // Sync icon with current theme
    updateIcon(btn, getEffectiveTheme());

    btn.addEventListener('click', function () {
      var current = getEffectiveTheme();
      var next = current === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      localStorage.setItem(STORAGE_KEY, next);
      updateIcon(btn, next);
    });

    // Update icon if system preference changes and no explicit choice is stored
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      if (!localStorage.getItem(STORAGE_KEY)) {
        root.removeAttribute('data-theme');
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
          root.setAttribute('data-theme', 'dark');
        }
        updateIcon(btn, getEffectiveTheme());
      }
    });
  });
})();
