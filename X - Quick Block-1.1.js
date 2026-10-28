// ==UserScript==
// @name         X - Quick Block
// @namespace    https://github.com/x-quick-block
// @version      1.1
// @description  Ajoute un bouton Block rapide sur chaque tweet — bloque et masque instantanément, sans confirmation
// @author       Marcel
// @match        https://x.com/*
// @match        https://twitter.com/*
// @run-at       document-idle
// @grant        GM_addStyle
// @noframes
// ==/UserScript==

(function () {
  "use strict";

  // Handles bloqués pendant la session — pour re-masquer si X re-render
  var blockedHandles = new Set();

  // Bearer token public de l'app web X (constant, embarqué dans le JS de x.com)
  var BEARER = "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

  GM_addStyle(`
    .qb-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      border: none;
      border-radius: 50%;
      background: none;
      color: #71767b;
      font-size: 13px;
      cursor: pointer;
      padding: 0;
      margin-left: 4px;
      vertical-align: middle;
      transition: background 0.15s, color 0.15s;
      flex-shrink: 0;
      line-height: 1;
    }
    .qb-btn:hover {
      background: rgba(244,33,46,0.15);
      color: #f4212e;
    }
    .qb-btn.qb-done {
      color: #f4212e;
      opacity: 0.6;
      pointer-events: none;
    }
  `);

  // ── Récupérer le CSRF token depuis le cookie ct0 ──
  function getCsrf() {
    var match = document.cookie.match(/ct0=([^;]+)/);
    return match ? match[1] : "";
  }

  // ── Extraire le screen_name d'un article tweet ──
  function getHandle(article) {
    var userNameDiv = article.querySelector("div[data-testid='User-Name']");
    if (!userNameDiv) return null;

    var spans = userNameDiv.querySelectorAll("span");
    for (var i = 0; i < spans.length; i++) {
      var txt = spans[i].textContent.trim();
      if (txt.startsWith("@") && txt.length > 1) {
        return txt.substring(1); // sans le @
      }
    }
    return null;
  }

  // ── Appel API Block ──
  function blockUser(screenName, callback) {
    var csrf = getCsrf();
    if (!csrf) {
      callback(false, "Pas de token CSRF (pas connecté ?)");
      return;
    }

    fetch("https://x.com/i/api/1.1/blocks/create.json", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "authorization": "Bearer " + BEARER,
        "x-csrf-token": csrf,
        "x-twitter-active-user": "yes",
        "x-twitter-auth-type": "OAuth2Session"
      },
      credentials: "include",
      body: "screen_name=" + encodeURIComponent(screenName)
    })
    .then(function (resp) {
      if (resp.ok) {
        callback(true);
      } else {
        resp.text().then(function (t) {
          callback(false, "HTTP " + resp.status + ": " + t.substring(0, 100));
        });
      }
    })
    .catch(function (err) {
      callback(false, err.message);
    });
  }

  // ── Masquer le tweet (remonter au cellInnerDiv parent) ──
  function hideTweet(article) {
    var cell = article.closest("div[data-testid='cellInnerDiv']");
    var target = cell || article;
    target.style.display = "none";
    target.dataset.qbHidden = "1";
  }

  // ── Injecter les boutons ──
  function injectButtons() {
    var articles = document.querySelectorAll("article[data-testid='tweet']");

    for (var i = 0; i < articles.length; i++) {
      var article = articles[i];

      var handle = getHandle(article);

      // Si ce handle a été bloqué pendant cette session, re-masquer
      if (handle && blockedHandles.has(handle.toLowerCase())) {
        hideTweet(article);
        continue;
      }

      // Déjà traité ?
      if (article.querySelector(".qb-btn")) continue;

      if (!handle) continue;

      // Trouver la zone date/time (le lien <time>)
      var timeEl = article.querySelector("time");
      if (!timeEl) continue;
      var timeLink = timeEl.closest("a");
      var anchor = timeLink || timeEl.parentNode;

      // Créer le bouton
      var btn = document.createElement("button");
      btn.className = "qb-btn";
      btn.textContent = "🚫";
      btn.title = "Bloquer @" + handle;
      btn.dataset.handle = handle;

      (function (b, a, h) {
        b.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();

          b.textContent = "⏳";
          b.style.pointerEvents = "none";

          blockUser(h, function (ok, err) {
            if (ok) {
              blockedHandles.add(h.toLowerCase());
              b.textContent = "✓";
              b.classList.add("qb-done");
              hideTweet(a);
            } else {
              b.textContent = "❌";
              b.title = "Erreur : " + (err || "inconnue");
              b.style.pointerEvents = "";
              console.error("[Quick Block] @" + h + " :", err);
            }
          });
        });
      })(btn, article, handle);

      // Insérer après la date
      anchor.parentNode.insertBefore(btn, anchor.nextSibling);
    }
  }

  // ── Observer les nouveaux tweets (scroll infini) ──
  var observer = new MutationObserver(function () {
    injectButtons();
  });

  function init() {
    var timeline = document.querySelector("main") || document.body;
    observer.observe(timeline, { childList: true, subtree: true });
    injectButtons();
  }

  // Attendre que le DOM X soit prêt
  var waitIv = setInterval(function () {
    if (document.querySelector("article[data-testid='tweet']")) {
      clearInterval(waitIv);
      init();
    }
  }, 500);

  setTimeout(function () { clearInterval(waitIv); init(); }, 10000);

})();