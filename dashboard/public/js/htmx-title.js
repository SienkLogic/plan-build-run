// Update document.title from HX-Title response header on HTMX navigation
document.addEventListener('htmx:afterSettle', function(event) {
  var title = event.detail.xhr && event.detail.xhr.getResponseHeader('HX-Title');
  if (title) document.title = title;
});
