// ====== CONFIG ======
var API_BASE = "https://script.google.com/macros/s/AKfycbymzwZPQOCat8KEukI_G0Pg5-SpIXdfzuE_m5_YH50871phWX98YbzFY3dmonD41omz2Q/exec";

// ====== STATE ======
var LOG = [];
var WATCHLIST = [];
var chart;

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
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(payload)
  }).then(function(res) {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  });
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
  // Scroll to top on nav
  window.scrollTo(0, 0);
}

// ====== FILTER + LOG TABLE ======
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
  var rows = $("logRows");
  rows.innerHTML = "";

  var data = getFilteredLog();
  $("count").textContent = "(" + data.length + ")";

  if (!data.length) {
    rows.innerHTML = '<tr><td colspan="10" class="p-6 text-center text-muted">No matches. Try clearing filters.</td></tr>';
    return;
  }

  for (var i = 0; i < data.length; i++) {
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

    var repeatBadge = r.repeat ? '<span class="px-2 py-0.5 rounded-full text-xs bg-amber-500/20 text-amber-300">[r]</span>' : "";

    rows.insertAdjacentHTML("beforeend",
      '<tr class="border-t border-faint/30 hover:bg-surface/50">' +
        '<td class="p-3 whitespace-nowrap text-muted">' + escHtml(r.dateViewed) + '</td>' +
        '<td class="p-3 font-medium text-white">' + escHtml(r.title) + '</td>' +
        '<td class="p-3 whitespace-nowrap text-muted">' + escHtml(r.season) + '</td>' +
        '<td class="p-3 whitespace-nowrap text-muted">' + escHtml(r.episode) + '</td>' +
        '<td class="p-3 text-slate-300">' + escHtml(r.episodeTitle) + '</td>' +
        '<td class="p-3 whitespace-nowrap text-muted">' + escHtml(r.platform) + '</td>' +
        '<td class="p-3">' + typePill + '</td>' +
        '<td class="p-3">' + repeatBadge + '</td>' +
        '<td class="p-3 whitespace-nowrap text-amber-400">' + stars(r.rating) + '</td>' +
        '<td class="p-3 min-w-[240px] text-slate-400">' + escHtml(r.notes) + '</td>' +
      '</tr>'
    );
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
  var host = $("watchlistCards");
  host.innerHTML = "";
  var list = computeWatchlistProgress();

  if (!list.length) {
    host.innerHTML = '<div class="bg-card rounded-2xl p-6 text-center text-muted">No items in your watchlist yet.</div>';
    return;
  }

  for (var i = 0; i < list.length; i++) {
    var w = list[i];
    var total = Number(w.totalEpisodes || 0);
    var done = Number(w.watchedEpisodes || 0);
    var pct = total ? Math.min(100, Math.round((done / total) * 100)) : (w.watched ? 100 : 0);

    var badge;
    if (norm(w.kind) === "film") {
      badge = '<span class="px-2 py-0.5 rounded-full text-xs bg-indigo-500/20 text-indigo-300">Film</span>';
    } else {
      badge = '<span class="px-2 py-0.5 rounded-full text-xs bg-emerald-500/20 text-emerald-300">Season ' + escHtml(w.season) + '</span>';
    }

    var doneBadge = w.watched
      ? '<span class="px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-300">Done</span>'
      : "";

    var prioColor = { "High": "text-red-400", "Medium": "text-amber-400", "Low": "text-slate-400" };
    var pc = prioColor[w.priority] || "text-muted";

    var toggleButton = norm(w.kind) === "film"
      ? '<button data-toggle="' + escHtml(w.id) + '" class="mt-2 w-full px-3 py-2 rounded-xl bg-surface border border-faint text-sm text-white hover:bg-faint transition active:scale-[0.98]">Toggle done</button>'
      : "";

    var progressLabel = norm(w.kind) === "film"
      ? (w.watched ? "Watched" : "Not watched")
      : (done + "/" + total + " eps");

    var barColor = w.watched ? "bg-green-500" : "bg-accent";

    host.insertAdjacentHTML("beforeend",
      '<div class="bg-card rounded-2xl p-4 space-y-3">' +
        '<div class="flex flex-wrap items-center gap-2">' +
          '<div class="font-semibold text-white">' + escHtml(w.title) + '</div>' +
          '<span class="px-2 py-0.5 rounded-full text-xs bg-surface ' + pc + '">' + escHtml(w.priority || "Medium") + '</span>' +
          badge +
          doneBadge +
        '</div>' +
        (w.notes ? '<div class="text-sm text-muted">' + escHtml(w.notes) + '</div>' : '') +
        '<div>' +
          '<div class="flex items-center justify-between text-sm mb-1.5">' +
            '<span class="text-slate-300">' + progressLabel + '</span>' +
            '<span class="text-muted">' + pct + '%</span>' +
          '</div>' +
          '<div class="h-2 w-full rounded-full bg-surface overflow-hidden">' +
            '<div class="h-full ' + barColor + ' rounded-full transition-all" style="width:' + pct + '%"></div>' +
          '</div>' +
          toggleButton +
        '</div>' +
      '</div>'
    );
  }

  // Film toggle handler
  var toggleBtns = host.querySelectorAll("[data-toggle]");
  for (var j = 0; j < toggleBtns.length; j++) {
    toggleBtns[j].addEventListener("click", function() {
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
  // Reset kind-dependent fields
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
  // Navigation
  var navBtns = document.querySelectorAll(".nav-btn");
  for (var i = 0; i < navBtns.length; i++) {
    navBtns[i].addEventListener("click", function() {
      var target = this.getAttribute("data-nav");
      if (target) showTab(target);
    });
  }

  // Filters -> rerender
  var filterIds = ["fSearch", "fType", "fPlatform", "fRepeat", "fMinRating", "fFrom", "fTo"];
  for (var j = 0; j < filterIds.length; j++) {
    $(filterIds[j]).addEventListener("input", renderLog);
    $(filterIds[j]).addEventListener("change", renderLog);
  }

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
