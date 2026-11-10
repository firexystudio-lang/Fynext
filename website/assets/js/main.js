/* =========================================================
   Fynext website — minimal terminal-style interactions
   FirexyTeam • https://firexy.ct.ws
   ========================================================= */
(function () {
  "use strict";

  const root = document.documentElement;
  const THEME_KEY = "fynext-theme";

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (e) {
      /* ignore */
    }
    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
      btn.textContent = theme === "light" ? "[tema: açık]" : "[tema: koyu]";
      btn.setAttribute(
        "aria-label",
        theme === "light" ? "Koyu temaya geç" : "Açık temaya geç"
      );
    });
  }

  function initTheme() {
    let saved = null;
    try {
      saved = localStorage.getItem(THEME_KEY);
    } catch (e) {
      /* ignore */
    }
    applyTheme(saved === "light" ? "light" : "dark");
    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        applyTheme(root.getAttribute("data-theme") === "light" ? "dark" : "light");
      });
    });
  }

  function initNav() {
    const toggle = document.querySelector("[data-nav-toggle]");
    const links = document.querySelector("[data-nav-links]");
    if (!toggle || !links) return;

    const close = () => {
      links.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    };

    toggle.addEventListener("click", () => {
      const open = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });

    links.querySelectorAll("a").forEach((a) => a.addEventListener("click", close));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });
    window.addEventListener("resize", () => {
      if (window.innerWidth > 720) close();
    });
  }

  function initCopy() {
    document.querySelectorAll("[data-copy]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const box = btn.closest(".code");
        if (!box) return;
        const pre = box.querySelector("pre");
        if (!pre) return;

        const text = pre.innerText.replace(/\s+$/, "");

        try {
          await navigator.clipboard.writeText(text);
        } catch (e) {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
        }

        const original = btn.textContent;
        btn.textContent = "[kopyalandı]";
        btn.classList.add("copied");
        setTimeout(() => {
          btn.textContent = original;
          btn.classList.remove("copied");
        }, 1500);
      });
    });
  }

  function detectOS() {
    const ua = navigator.userAgent.toLowerCase();
    const platform = (
      navigator.userAgentData && navigator.userAgentData.platform
        ? navigator.userAgentData.platform
        : navigator.platform || ""
    ).toLowerCase();

    if (ua.includes("win") || platform.includes("win")) return "windows";
    if (ua.includes("mac") || platform.includes("mac")) return "macos";
    if (ua.includes("linux") || ua.includes("android") || platform.includes("linux"))
      return "linux";
    return "windows";
  }

  function initTabs() {
    document.querySelectorAll("[data-tabs]").forEach((group) => {
      const groupName = group.getAttribute("data-tabs");
      const buttons = group.querySelectorAll("[data-tab]");
      const panels = document.querySelectorAll('[data-panel="' + groupName + '"]');

      group.setAttribute("role", "tablist");
      group.setAttribute(
        "aria-label",
        groupName === "os" ? "Kurulum işletim sistemi" : groupName + " seçenekleri"
      );

      buttons.forEach((button) => {
        const name = button.getAttribute("data-tab");
        button.id = "tab-" + groupName + "-" + name;
        button.setAttribute("role", "tab");
        button.setAttribute(
          "aria-controls",
          "panel-" + groupName + "-" + name
        );
      });

      panels.forEach((panel) => {
        const name = panel.getAttribute("data-value");
        panel.id = "panel-" + groupName + "-" + name;
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", "tab-" + groupName + "-" + name);
        panel.tabIndex = 0;
      });

      const activate = (name) => {
        buttons.forEach((button) => {
          const active = button.getAttribute("data-tab") === name;
          button.classList.toggle("active", active);
          button.setAttribute("aria-selected", String(active));
          button.tabIndex = active ? 0 : -1;
        });
        panels.forEach((panel) => {
          const active = panel.getAttribute("data-value") === name;
          panel.classList.toggle("active", active);
          panel.hidden = !active;
        });
      };

      buttons.forEach((b) =>
        b.addEventListener("click", () => activate(b.getAttribute("data-tab")))
      );

      group.addEventListener("keydown", (event) => {
        const currentIndex = Array.from(buttons).indexOf(document.activeElement);
        if (currentIndex < 0) return;

        let nextIndex;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
          nextIndex = (currentIndex + 1) % buttons.length;
        } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
          nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
        } else if (event.key === "Home") {
          nextIndex = 0;
        } else if (event.key === "End") {
          nextIndex = buttons.length - 1;
        } else {
          return;
        }

        event.preventDefault();
        const nextButton = buttons[nextIndex];
        activate(nextButton.getAttribute("data-tab"));
        nextButton.focus();
      });

      if (group.getAttribute("data-auto") !== "false") {
        const detected = detectOS();
        const exists = Array.from(buttons).some(
          (b) => b.getAttribute("data-tab") === detected
        );
        activate(exists ? detected : buttons[0] && buttons[0].getAttribute("data-tab"));
      }
    });
  }

  function initFaq() {
    const items = document.querySelectorAll(".faq-item");
    items.forEach((item) => {
      item.addEventListener("toggle", () => {
        if (!item.open) return;
        items.forEach((other) => {
          if (other !== item) other.open = false;
        });
      });
    });
  }

  function initDocsSpy() {
    const side = document.querySelector("[data-docs-spy]");
    if (!side || !("IntersectionObserver" in window)) return;

    const links = Array.from(side.querySelectorAll("a[href^='#']"));
    const map = new Map();
    links.forEach((l) => {
      const section = document.getElementById(l.getAttribute("href").slice(1));
      if (section) map.set(section, l);
    });

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          links.forEach((link) => {
            link.classList.remove("spy-active");
            link.removeAttribute("aria-current");
          });
          const link = map.get(entry.target);
          if (link) {
            link.classList.add("spy-active");
            link.setAttribute("aria-current", "location");
          }
        });
      },
      { rootMargin: "-35% 0px -35% 0px" }
    );

    map.forEach((_, section) => io.observe(section));
  }

  function init() {
    initTheme();
    initNav();
    initCopy();
    initTabs();
    initFaq();
    initDocsSpy();

    document.querySelectorAll("[data-year]").forEach((el) => {
      el.textContent = new Date().getFullYear();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
