// Prevent FOUC (Flash of Unstyled Content) by setting theme immediately.
//
// Hard-locked to dark (production theme). The HTML root always carries `dark`.
(function () {
  try {
    var html = document.documentElement;
    html.classList.remove('light', 'graphite');
    html.classList.add('dark');
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('theme', 'dark');
    }
  } catch (e) {
    // private mode / quota — fall through, classes still applied above
  }
})();
