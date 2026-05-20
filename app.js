// ====== CONFIG ======
var API_BASE = "https://script.google.com/macros/s/AKfycbymzwZPQOCat8KEukI_G0Pg5-SpIXdfzuE_m5_YH50871phWX98YbzFY3dmonD41omz2Q/exec";
var TMDB_KEY = "f1c1f572df4b1c140d845e056fdcb05f";
var TMDB_IMG = "https://image.tmdb.org/t/p/w200";
var TMDB_SEARCH = "https://api.themoviedb.org/3/search/multi";
var LOG_PAGE_SIZE = 10;
var WL_PAGE_SIZE = 10;
var POSTER_CACHE_KEY = "watchlog_poster_cache";

// ====== STATE ======
var LOG = [];
var WATCHLIST = [];
var chart;
var logVisible = LOG_PAGE_SIZE;
var wlVisible = WL_PAGE_SIZE;
var posterCache = {};
var posterFetching = {};

// ====== HELPERS ======
function $(id) { return document.getElementById(id); }

function showError(msg) {
  var el = $("error");
  if (!msg) { el.classList.add("hidden"); el.textContent = ""; return; }
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(function() { el.classList.add("hidden"); }, 6000);
}

function norm(s) { return String(s || "").trim().toLowerCase(); }

function inferType(season, episode) {
  var s = norm(season), e = norm(episode);
  if (s === "movie" || e === "movie") return "movie";
  if (s === "special" || e === "special") return "special";
  return "episode";
}

function parseDate(s) {
  var m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function monthKey(dateStr) {
  var d = parseDate(dateStr);
  if (!d) return "Unknown";
  var mm = String(d.getMonth() + 1).padStart(2, "0");
  return d.getFullYear() + "-" + mm;
}

function stars(n) {
  var x = Number(n || 0);
  return x ? "\u2605".repeat(x) : "\u2014";
}

function escHtml(s) {
  var div = document.createElement("div");
  div.textContent = String(s || "");
  return div.innerHTML;
}

function posterIcon(type) {
  if (type === "movie") return "\uD83C\uDFAC";
  if (type === "special") return "\uD83C\uDFA4";
  return "\uD83D\uDCFA";
}

function apiGet(path) {
  return fetch(API_BASE + "?path=" + encodeURIComponent(path), {
    method: "GET",
    headers: { "Accept": "application/json" }
  }).then(function(res) {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  });
}

function apiPost(path, body) {
  var payload = Object.assign({ path: path }, body);
  return fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "text/plain", "Accept": "application/json" },
    body: JSON.stringify(payload)
  }).then(function(res) {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  });
}

// ====== POSTER CACHE ======
function loadPosterCache() {
  try {
    var raw = localStorage.getItem(POSTER_CACHE_KEY);
    if (raw) posterCache = JSON.parse(raw);
  } catch (e) {
    posterCache = {};
  }
}

function savePosterCache() {
  try {
    localStorage.setItem(POSTER_CACHE_KEY, JSON.stringify(posterCache));
  } catch (e) {
    // ignore
  }
}

function getPosterUrl(title) {
  var key = norm(title);
  if (!key) return null;
  var val = posterCache[key];
  if (val === "none") return null;
  return val || null;
}

function posterHtml(title, type) {
  var url = getPosterUrl(title);
  if (url) {
    return '<img src="' + escHtml(url) + '" alt="" class="w-20 h-28 object-cover rounded-xl flex-shrink-0" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'" />' +
           '<div class="w-20 h-28 bg-surface rounded-xl items-center justify-center text-3xl select-none flex-shrink-0" style="display:none">' + posterIcon(type) + '</div>';
  }
  var key = norm(title);
  if (key && posterCache[key] === undefined && !posterFetching[key]) {
    // Not yet fetched — show pulse placeholder
    return '<div class="w-20 h-28 bg-surface rounded-xl animate-pulse flex-shrink-0" data-poster-key="' + escHtml(key) + '"></div>';
  }
  // "none" or empty title — show emoji
  return '<div class="w-20 h-28 bg-surface rounded-xl flex items-center justify-center text-3xl select-none flex-shrink-0">' + posterIcon(type) + '</div>';
}

function fetchPostersForTitles(titles, callback) {
  var toFetch = [];
  for (var i = 0; i < titles.length; i++) {
    var key = norm(titles[i]);
    if (key && posterCache[key] === undefined && !posterFetching[key]) {
      posterFetching[key] = true;
      toFetch.push({ key: key, title: titles[i] });
    }
  }

  if (!toFetch.length) return;

  var idx = 0;
  function fetchNext() {
    if (idx >= toFetch.length) {
      savePosterCache();
      if (callback) callback();
      return;
    }
    var item = toFetch[idx];
    idx++;
    var url = TMDB_SEARCH + "?api_key=" + TMDB_KEY + "&query=" + encodeURIComponent(item.title) + "&page=1";

    fetch(url)
      .then(function(res) { return res.json(); })
      .then(function(data) {
        var posterPath = null;
        if (data.results && data.results.length) {
          for (var r = 0; r < data.results.length; r++) {
            if (data.results[r].poster_path) {
              posterPath = data.results[r].poster_path;
              break;
            }
          }
        }
        if (posterPath) {
          posterCache[item.key] = TMDB_IMG + posterPath;
        } else {
          posterCache[item.key] = "none";
        }
        delete posterFetching[item.key];
      })
      .catch(function() {
        posterCache[item.key] = "none";
        delete posterFetching[item.key];
      })
      .then(function() {
        setTimeout(fetchNext, 250);
      });
  }
  fetchNext();
}

// ====== NAVIGATION ======
function showTab(name) {
  ["home", "log", "watchlist", "stats"].forEach(function(t) {
    var el = $("tab-" + t);
    if (t === name) {
      el.classList.remove("hidden");
    } else {
      el.classList.add("hidden");
    }
  });
  window.scrollTo(0, 0);
}

// ====== FILTER + LOG ======
function getFilteredLog() {
  var s = norm($("fSearch").value);
  var type = $("fType").value;
  var platform = $("fPlatform").value;
  var rep = $("fRepeat").value;
  var minR = Number($("fMinRating").value || 0);
  var from = $("fFrom").value ? parseDate($("fFrom").value) : null;
  var to = $("fTo").value ? parseDate($("fTo").value) : null;

  return LOG.slice()
    .filter(function(r) {
      var t = inferType(r.season, r.episode);
      if (type !== "all" && t !== type) return false;
      if (platform !== "all" && norm(r.platform) !== norm(platform)) return false;
      var isRepeat = !!r.repeat;
      if (rep === "repeat" && !isRepeat) return false;
      if (rep === "first" && isRepeat) return false;
      if (Number(r.rating || 0) < minR) return false;
      var dv = parseDate(r.dateViewed);
      if (from && dv && dv < from) return false;
      if (to && dv && dv > to) return false;
      if (!s) return true;
      var hay = (r.title + " " + (r.episodeTitle || "") + " " + (r.notes || "")).toLowerCase();
      return hay.indexOf(s) !== -1;
    })
    .sort(function(a, b) {
      return String(b.dateViewed).localeCompare(String(a.dateViewed));
    });
}

function renderLog() {
  var host = $("logTiles");
  host.innerHTML = "";
  var data = getFilteredLog();
  var total = data.length;
  var showing = Math.min(logVisible, total);

  $("count").textContent = "(" + total + ")";

  if (!total) {
    $("logEmpty").classList.remove("hidden");
    $("logLoadMore").classList.add("hidden");
    return;
  }
  $("logEmpty").classList.add("hidden");

  var titlesToFetch = [];

  for (var i = 0; i < showing; i++) {
    var r = data[i];
    var t = inferType(r.season, r.episode);

    var typePill;
    if (t === "movie") {
      typePill = '<span class="px-2 py-0.5 rounded-full text-xs bg-indigo-500/20 text-indigo-300">Movie</span>';
    } else if (t === "special") {
      typePill = '<span class="px-2 py-0.5 rounded-full text-xs bg-fuchsia-500/20 text-fuchsia-300">Special</span>';
    } else {
      typePill = '<span class="px-2 py-0.5 rounded-full text-xs bg-slate-500/20 text-slate-300">Episode</span>';
    }

    var repeatBadge = r.repeat ? ' <span class="px-2 py-0.5 rounded-full text-xs bg-amber-500/20 text-amber-300">[r]</span>' : "";

    var seLine = "";
    if (t === "episode") {
      seLine = "S" + escHtml(r.season) + " E" + escHtml(r.episode);
      if (r.episodeTitle) seLine += ' &middot; <span class="text-slate-300">' + escHtml(r.episodeTitle) + '</span>';
    } else if (r.episodeTitle) {
      seLine = '<span class="text-slate-300">' + escHtml(r.episodeTitle) + '</span>';
    }

    var notesHtml = "";
    if (r.notes) {
      notesHtml = '<div class="notes-text line-clamp-2 text-xs text-slate-400 mt-1 cursor-pointer" data-expanded="false">' + escHtml(r.notes) + '</div>';
    }

    // Collect titles for TMDB fetch
    if (r.title && norm(r.title) && posterCache[norm(r.title)] === undefined) {
      titlesToFetch.push(r.title);
    }

    host.insertAdjacentHTML("beforeend",
      '<div class="bg-card rounded-2xl p-3 flex gap-3">' +
        '<div class="flex-shrink-0">' + posterHtml(r.title, t) + '</div>' +
        '<div class="flex-1 min-w-0">' +
          '<div class="font-semibold text-white text-sm leading-snug truncate">' + escHtml(r.title) + '</div>' +
          (seLine ? '<div class="text-xs text-muted mt-0.5">' + seLine + '</div>' : '') +
          '<div class="flex items-center gap-2 mt-1">' +
            '<span class="text-amber-400 text-xs">' + stars(r.rating) + '</span>' +
            (r.platform ? '<span class="text-xs text-muted">&middot; ' + escHtml(r.platform) + '</span>' : '') +
          '</div>' +
          '<div class="flex flex-wrap items-center gap-1.5 mt-1">' +
            '<span class="text-xs text-faint">' + escHtml(r.dateViewed) + '</span>' +
            typePill +
            repeatBadge +
          '</div>' +
          notesHtml +
        '</div>' +
      '</div>'
    );
  }

  // Notes expand/collapse
  var noteEls = host.querySelectorAll(".notes-text");
  for (var n = 0; n < noteEls.length; n++) {
    noteEls[n].addEventListener("click", function() {
      var expanded = this.getAttribute("data-expanded") === "true";
      if (expanded) {
        this.classList.remove("line-clamp-none");
        this.classList.add("line-clamp-2");
        this.setAttribute("data-expanded", "false");
      } else {
        this.classList.remove("line-clamp-2");
        this.classList.add("line-clamp-none");
        this.setAttribute("data-expanded", "true");
      }
    });
  }

  // Load more
  if (showing < total) {
    $("logLoadMore").classList.remove("hidden");
    $("logShowing").textContent = "Showing " + showing + " of " + total;
  } else {
    $("logLoadMore").classList.add("hidden");
  }

  // Fetch missing posters
  if (titlesToFetch.length) {
    fetchPostersForTitles(titlesToFetch, function() {
      renderLog();
    });
  }
}

// ====== WATCHLIST ======
function computeWatchlistProgress() {
  var episodeSets = {};
  var movieTitles = {};

  for (var i = 0; i < LOG.length; i++) {
    var r = LOG[i];
    var t = inferType(r.season, r.episode);
    if (t === "movie") {
      movieTitles[norm(r.title)] = true;
    }
    if (t !== "episode") continue;
    var key = norm(r.title) + "|" + String(r.season || "").trim();
    if (!episodeSets[key]) episodeSets[key] = {};
    episodeSets[key][String(r.episode || "").trim()] = true;
  }

  return WATCHLIST.map(function(w) {
    var kind = norm(w.kind) || "season";
    if (kind === "film") {
      var autoDone = !!movieTitles[norm(w.title)];
      var done = autoDone || !!w.manualDone;
      return Object.assign({}, w, { watched: done, watchedEpisodes: done ? 1 : 0, totalEpisodes: 1 });
    } else {
      var key = norm(w.title) + "|" + String(w.season || "").trim();
      var eps = episodeSets[key];
      var watchedEpisodes = eps ? Object.keys(eps).length : 0;
      var total = Number(w.totalEpisodes || 0);
      var watched = total ? watchedEpisodes >= total : watchedEpisodes > 0;
      return Object.assign({}, w, { watched: watched, watchedEpisodes: watchedEpisodes, totalEpisodes: total });
    }
  }).sort(function(a, b) {
    var pr = { high: 0, medium: 1, low: 2 };
    var pa = pr[norm(a.priority)];
    var pb = pr[norm(b.priority)];
    if (pa === undefined) pa = 9;
    if (pb === undefined) pb = 9;
    if (pa !== pb) return pa - pb;
    return String(a.title).localeCompare(String(b.title));
  });
}

function renderWatchlist() {
  var host = $("watchlistTiles");
  host.innerHTML = "";
  var list = computeWatchlistProgress();
  var total = list.length;
  var showing = Math.min(wlVisible, total);

  if (!total) {
    $("wlEmpty").classList.remove("hidden");
    $("wlLoadMore").classList.add("hidden");
    return;
  }
  $("wlEmpty").classList.add("hidden");

  var titlesToFetch = [];

  for (var i = 0; i < showing; i++) {
    var w = list[i];
    var totalEps = Number(w.totalEpisodes || 0);
    var doneEps = Number(w.watchedEpisodes || 0);
    var pct = totalEps ? Math.min(100, Math.round((doneEps / totalEps) * 100)) : (w.watched ? 100 : 0);
    var isFilm = norm(w.kind) === "film";
    var tileType = isFilm ? "movie" : "episode";

    var kindBadge;
    if (isFilm) {
      kindBadge = '<span class="px-2 py-0.5 rounded-full text-xs bg-indigo-500/20 text-indigo-300">Film</span>';
    } else {
      kindBadge = '<span class="px-2 py-0.5 rounded-full text-xs bg-emerald-500/20 text-emerald-300">Season ' + escHtml(w.season) + '</span>';
    }

    var prioColor = { "High": "text-red-400", "Medium": "text-amber-400", "Low": "text-slate-400" };
    var pc = prioColor[w.priority] || "text-muted";

    var doneBadge = w.watched
      ? '<span class="px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-300">Done</span>'
      : "";

    var barColor = w.watched ? "bg-green-500" : "bg-accent";

    var progressLabel = isFilm
      ? (w.watched ? "Watched" : "Not watched")
      : (doneEps + "/" + totalEps + " eps");

    var toggleBtn = isFilm
      ? '<button data-toggle="' + escHtml(w.id) + '" class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm transition active:scale-[0.9] ' +
        (w.watched ? 'bg-green-500 text-white' : 'bg-surface border border-faint text-faint hover:border-green-500 hover:text-green-400') +
        '">' +
        '\u2713' +
        '</button>'
      : "";

    var notesHtml = "";
    if (w.notes) {
      notesHtml = '<div class="notes-text line-clamp-2 text-xs text-slate-400 mt-1 cursor-pointer" data-expanded="false">' + escHtml(w.notes) + '</div>';
    }

    if (w.title && norm(w.title) && posterCache[norm(w.title)] === undefined) {
      titlesToFetch.push(w.title);
    }

    host.insertAdjacentHTML("beforeend",
      '<div class="bg-card rounded-2xl p-3 flex gap-3">' +
        '<div class="flex-shrink-0">' + posterHtml(w.title, tileType) + '</div>' +
        '<div class="flex-1 min-w-0">' +
          '<div class="flex items-start gap-2">' +
            '<div class="flex-1 min-w-0">' +
              '<div class="font-semibold text-white text-sm leading-snug truncate">' + escHtml(w.title) + '</div>' +
              '<div class="flex flex-wrap items-center gap-1.5 mt-1">' +
                '<span class="px-2 py-0.5 rounded-full text-xs bg-surface ' + pc + '">' + escHtml(w.priority || "Medium") + '</span>' +
                kindBadge +
                doneBadge +
              '</div>' +
            '</div>' +
            toggleBtn +
          '</div>' +
          '<div class="mt-2">' +
            '<div class="flex items-center justify-between text-xs mb-1">' +
              '<span class="text-slate-300">' + progressLabel + '</span>' +
              '<span class="text-muted">' + pct + '%</span>' +
            '</div>' +
            '<div class="h-1.5 w-full rounded-full bg-surface overflow-hidden">' +
              '<div class="h-full ' + barColor + ' rounded-full transition-all" style="width:' + pct + '%"></div>' +
            '</div>' +
          '</div>' +
          notesHtml +
        '</div>' +
      '</div>'
    );
  }

  // Notes expand/collapse
  var noteEls = host.querySelectorAll(".notes-text");
  for (var n = 0; n < noteEls.length; n++) {
    noteEls[n].addEventListener("click", function() {
      var expanded = this.getAttribute("data-expanded") === "true";
      if (expanded) {
        this.classList.remove("line-clamp-none");
        this.classList.add("line-clamp-2");
        this.setAttribute("data-expanded", "false");
      } else {
        this.classList.remove("line-clamp-2");
        this.classList.add("line-clamp-none");
        this.setAttribute("data-expanded", "true");
      }
    });
  }

  // Toggle done
  var toggleBtns = host.querySelectorAll("[data-toggle]");
  for (var j = 0; j < toggleBtns.length; j++) {
    toggleBtns[j].addEventListener("click", function(e) {
      e.stopPropagation();
      var id = this.getAttribute("data-toggle");
      for (var k = 0; k < WATCHLIST.length; k++) {
        if (String(WATCHLIST[k].id) === String(id)) {
          WATCHLIST[k].manualDone = !WATCHLIST[k].manualDone;
          break;
        }
      }
      renderWatchlist();
      renderStats();
    });
  }

  // Load more
  if (showing < total) {
    $("wlLoadMore").classList.remove("hidden");
    $("wlShowing").textContent = "Showing " + showing + " of " + total;
  } else {
    $("wlLoadMore").classList.add("hidden");
  }

  // Fetch missing posters
  if (titlesToFetch.length) {
    fetchPostersForTitles(titlesToFetch, function() {
      renderWatchlist();
    });
  }
}

// ====== STATS / CHART ======
function buildMonthlyCounts() {
  var counts = {};
  for (var i = 0; i < LOG.length; i++) {
    var k = monthKey(LOG[i].dateViewed);
    counts[k] = (counts[k] || 0) + 1;
  }

  var start = new Date(2018, 0, 1);
  var end = new Date();

  var labels = [];
  var data = [];
  var cur = new Date(start);

  while (cur <= end) {
    var mm = String(cur.getMonth() + 1).padStart(2, "0");
    var k = cur.getFullYear() + "-" + mm;
    labels.push(k);
    data.push(counts[k] || 0);
    cur.setMonth(cur.getMonth() + 1);
  }

  if (counts["Unknown"]) {
    labels.push("Unknown");
    data.push(counts["Unknown"]);
  }

  return { labels: labels, data: data };
}

function renderStats() {
  var result = buildMonthlyCounts();
  var labels = result.labels;
  var data = result.data;

  var ctx = $("chart").getContext("2d");
  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{
        label: "Items",
        data: data,
        backgroundColor: "#f59e0b",
        borderRadius: 4,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { precision: 0, color: "#94a3b8" },
          grid: { color: "#334155" }
        },
        x: {
          ticks: { maxRotation: 45, minRotation: 45, color: "#94a3b8", font: { size: 10 } },
          grid: { display: false }
        }
      }
    }
  });
}

// ====== MODALS ======
function openLogModal() {
  $("modalLog").classList.remove("hidden");
  var today = new Date();
  var yyyy = today.getFullYear();
  var mm = String(today.getMonth() + 1).padStart(2, "0");
  var dd = String(today.getDate()).padStart(2, "0");
  $("aDate").value = yyyy + "-" + mm + "-" + dd;
}

function closeLogModal() {
  $("modalLog").classList.add("hidden");
}

function openWatchlistModal() {
  $("modalWatchlist").classList.remove("hidden");
  updateWatchlistKindFields();
}

function closeWatchlistModal() {
  $("modalWatchlist").classList.add("hidden");
}

function updateWatchlistKindFields() {
  var kind = $("wKind").value;
  if (kind === "film") {
    $("wSeasonGroup").classList.add("hidden");
    $("wTotalGroup").classList.add("hidden");
  } else {
    $("wSeasonGroup").classList.remove("hidden");
    $("wTotalGroup").classList.remove("hidden");
  }
}

function saveLogEntry() {
  showError("");

  var row = {
    dateViewed: $("aDate").value,
    title: $("aTitle").value.trim(),
    season: $("aSeason").value.trim(),
    episode: $("aEpisode").value.trim(),
    episodeTitle: $("aEpTitle").value.trim(),
    platform: $("aPlatform").value,
    repeat: $("aRepeat").checked,
    rating: Number($("aRating").value || 0),
    notes: $("aNotes").value.trim()
  };

  if (!row.title) { showError("Title is required."); return; }
  if (!row.season) row.season = "1";
  if (!row.episode) row.episode = "1";

  apiPost("addLog", { row: row })
    .then(function(resp) {
      if (!resp.ok) throw new Error(resp.error || "Save failed");
      return sync();
    })
    .then(function() {
      closeLogModal();
      $("aTitle").value = "";
      $("aSeason").value = "";
      $("aEpisode").value = "";
      $("aEpTitle").value = "";
      $("aPlatform").value = "";
      $("aRepeat").checked = false;
      $("aRating").value = "";
      $("aNotes").value = "";
    })
    .catch(function(e) {
      showError(String(e));
    });
}

function saveWatchlistEntry() {
  showError("");

  var kind = $("wKind").value;
  var isFilm = kind === "film";

  var row = {
    kind: kind,
    title: $("wTitle").value.trim(),
    season: isFilm ? "movie" : ($("wSeason").value.trim() || "1"),
    totalEpisodes: isFilm ? 1 : (Number($("wTotal").value) || 0),
    priority: $("wPriority").value,
    notes: $("wNotes").value.trim(),
    manualDone: false
  };

  if (!row.title) { showError("Title is required."); return; }
  if (!isFilm && !row.totalEpisodes) { showError("Total episodes is required for seasons."); return; }

  apiPost("addWatchlist", { row: row })
    .then(function(resp) {
      if (!resp.ok) throw new Error(resp.error || "Save failed");
      return sync();
    })
    .then(function() {
      closeWatchlistModal();
      $("wTitle").value = "";
      $("wKind").value = "season";
      $("wSeason").value = "";
      $("wTotal").value = "";
      $("wPriority").value = "Medium";
      $("wNotes").value = "";
      updateWatchlistKindFields();
    })
    .catch(function(e) {
      showError(String(e));
    });
}

// ====== SYNC ======
function sync() {
  showError("");
  return apiGet("log")
    .then(function(resp) {
      if (!resp.ok) throw new Error(resp.error || "Sync failed");
      LOG = resp.log || [];
      WATCHLIST = resp.watchlist || [];
      logVisible = LOG_PAGE_SIZE;
      wlVisible = WL_PAGE_SIZE;
      renderLog();
      renderWatchlist();
      renderStats();
    })
    .catch(function(e) {
      showError(String(e));
    });
}

// ====== INIT ======
function init() {
  // Load poster cache from localStorage
  loadPosterCache();

  // Navigation
  var navBtns = document.querySelectorAll(".nav-btn");
  for (var i = 0; i < navBtns.length; i++) {
    navBtns[i].addEventListener("click", function() {
      var target = this.getAttribute("data-nav");
      if (target) showTab(target);
    });
  }

  // Filters -> rerender (also reset pagination)
  var filterIds = ["fSearch", "fType", "fPlatform", "fRepeat", "fMinRating", "fFrom", "fTo"];
  for (var j = 0; j < filterIds.length; j++) {
    $(filterIds[j]).addEventListener("input", function() { logVisible = LOG_PAGE_SIZE; renderLog(); });
    $(filterIds[j]).addEventListener("change", function() { logVisible = LOG_PAGE_SIZE; renderLog(); });
  }

  // Load more buttons
  $("btnLogMore").addEventListener("click", function() {
    logVisible += LOG_PAGE_SIZE;
    renderLog();
  });
  $("btnWlMore").addEventListener("click", function() {
    wlVisible += WL_PAGE_SIZE;
    renderWatchlist();
  });

  // Add to Log modal
  $("homeAddLog").addEventListener("click", openLogModal);
  $("modalLogClose").addEventListener("click", closeLogModal);
  $("btnSaveLog").addEventListener("click", saveLogEntry);

  $("btnSetMovie").addEventListener("click", function() {
    $("aSeason").value = "movie";
    $("aEpisode").value = "movie";
  });
  $("btnSetSpecial").addEventListener("click", function() {
    $("aSeason").value = "special";
    $("aEpisode").value = "special";
  });

  // Add to Watchlist modal
  $("homeAddWatchlist").addEventListener("click", openWatchlistModal);
  $("modalWatchlistClose").addEventListener("click", closeWatchlistModal);
  $("btnSaveWatchlist").addEventListener("click", saveWatchlistEntry);
  $("wKind").addEventListener("change", updateWatchlistKindFields);

  // Sync
  $("homeSync").addEventListener("click", sync);

  // Initial load
  showTab("home");
  sync();
}

init();
