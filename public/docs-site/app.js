(function () {
  "use strict";

  // ---- Mobile sidebar toggle ----
  var toggle = document.querySelector(".menu-toggle");
  var sidebar = document.querySelector(".sidebar");
  if (toggle && sidebar) {
    toggle.addEventListener("click", function () {
      var open = sidebar.classList.toggle("open");
      toggle.classList.toggle("open", open);
    });
    document.querySelectorAll(".sidebar a").forEach(function (link) {
      link.addEventListener("click", function () {
        sidebar.classList.remove("open");
        toggle.classList.remove("open");
      });
    });
  }

  // ---- Active nav link on scroll ----
  var sections = Array.prototype.slice.call(document.querySelectorAll("section.doc-section[id]"));
  var navLinks = Array.prototype.slice.call(document.querySelectorAll(".sidebar a[href^='#']"));

  function setActive(id) {
    navLinks.forEach(function (link) {
      link.classList.toggle("active", link.getAttribute("href") === "#" + id);
    });
  }

  if ("IntersectionObserver" in window && sections.length) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: 0 }
    );
    sections.forEach(function (section) {
      observer.observe(section);
    });
  }

  // ---- Reveal on scroll ----
  var revealEls = Array.prototype.slice.call(document.querySelectorAll(".reveal"));
  if ("IntersectionObserver" in window && revealEls.length) {
    var revealObserver = new IntersectionObserver(
      function (entries, obs) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08 }
    );
    revealEls.forEach(function (el) {
      revealObserver.observe(el);
    });
  } else {
    revealEls.forEach(function (el) {
      el.classList.add("in");
    });
  }

  // ---- Code tabs ----
  document.querySelectorAll(".code-block").forEach(function (block) {
    var tabs = block.querySelectorAll(".code-tabs button");
    var panes = block.querySelectorAll("pre");
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        var target = tab.getAttribute("data-tab");
        tabs.forEach(function (t) {
          t.classList.toggle("active", t === tab);
        });
        panes.forEach(function (pane) {
          pane.hidden = pane.getAttribute("data-tab") !== target;
        });
      });
    });
  });

  // ---- Copy button ----
  document.querySelectorAll(".code-block .copy-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var block = btn.closest(".code-block");
      var visiblePane = block.querySelector("pre:not([hidden])");
      if (!visiblePane) return;
      navigator.clipboard.writeText(visiblePane.textContent.trim()).then(function () {
        var original = btn.textContent;
        btn.textContent = "Copiado!";
        setTimeout(function () {
          btn.textContent = original;
        }, 1600);
      });
    });
  });
})();
