/* AGBE — theme control.
 *
 * The stylesheet already handles both themes on its own: a bare :root carries the
 * light palette and a prefers-color-scheme block overrides it. So the page is
 * fully readable with JavaScript disabled, and this file only adds an explicit
 * override for readers whose system setting does not match what they want.
 *
 * The override is written to data-theme on <html>, which the stylesheet honours
 * ahead of the media query in both directions.
 */
(function () {
  "use strict";

  var KEY = "agbe-theme";
  var root = document.documentElement;

  function systemPrefersDark() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function stored() {
    try {
      return localStorage.getItem(KEY);
    } catch (e) {
      return null; // private browsing, or storage disabled
    }
  }

  function persist(value) {
    try {
      localStorage.setItem(KEY, value);
    } catch (e) {
      /* not fatal: the theme still applies for this page view */
    }
  }

  function activeTheme() {
    return root.getAttribute("data-theme") || (systemPrefersDark() ? "dark" : "light");
  }

  function apply(theme) {
    root.setAttribute("data-theme", theme);
    if (button) {
      button.textContent = theme === "dark" ? "Light" : "Dark";
      button.setAttribute("aria-label", "Switch to " + (theme === "dark" ? "light" : "dark") + " theme");
    }
  }

  var button = document.querySelector(".theme-toggle");

  // Restore a previous explicit choice. Absent one, leave the attribute unset so
  // the media query keeps control and the page follows the system.
  var saved = stored();
  if (saved === "dark" || saved === "light") {
    apply(saved);
  } else if (button) {
    button.textContent = systemPrefersDark() ? "Light" : "Dark";
  }

  if (button) {
    button.addEventListener("click", function () {
      var next = activeTheme() === "dark" ? "light" : "dark";
      apply(next);
      persist(next);
    });
  }

  // Follow the system while the reader has not made an explicit choice.
  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    var onChange = function (e) {
      if (stored()) return;
      if (button) button.textContent = e.matches ? "Light" : "Dark";
    };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
})();
