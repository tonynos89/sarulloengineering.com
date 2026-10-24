/* Script comune a tutte le pagine */
(function () {
  "use strict";

  // Ricorda la lingua scelta dal visitatore (usata dal redirect in /index.html)
  document.querySelectorAll("[data-lang]").forEach(function (link) {
    link.addEventListener("click", function () {
      try { localStorage.setItem("se-lang", link.getAttribute("data-lang")); } catch (e) {}
    });
  });

  // Anno corrente nel footer
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });
})();
