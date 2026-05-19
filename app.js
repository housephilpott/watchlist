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

// ====== RENDER: TABS ======
function showTab(name) {
  ["log", "watchlist", "stats"].forEach(function(t) {
    var el = $("tab-" + t);
    if (t === name) {
      el.classList.remove("hidden");
    } else {
      el.classList.add("hidden");
    }
  });
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
    rows.innerHTML = '<tr><td colspan="10" class="p-6 text-center text-slate-500">No matches. Try clearing filters.</td></tr>';
    return;
  }

  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    var t = inferType(r.season, r.episode);
    var typePill;
    if (t === "movie") {
      typePill = '<span class="px-2 py-1 rounded-full text-xs bg-indigo-600 text-white">Movie</span>';
    } else if (t === "special") {
      typePill = '<span class="px-2 py-1 rounded-full text-xs bg-fuchsia-600 text-white">Special</span>';
    } else {
      typePill = '<span class="px-2 py-1 rounded-full text-xs bg-slate-200 text-slate-800">Episode</span>';
    }

    var repeatBadge = r.repeat ? '<span class="px-2 py-1 rounded-full text-xs bg-slate-200">[r]</span>' : "";

    rows.insertAdjacentHTML("beforeend",
      '<tr class="border-t hover:bg-slate-50">' +
        '<td class="p-3 whitespace-nowrap">' + escHtml(r.dateViewed) + '</td>' +
        '<td class="p-3 font-medium">' + escHtml(r.title) + '</td>' +
        '<td class="p-3 whitespace-nowrap">' + escHtml(r.season) + '</td>' +
        '<td class="p-3 whitespace-nowrap">' + escHtml(r.episode) + '</td>' +
        '<td class="p-3">' + escHtml(r.episodeTitle) + '</td>' +
        '<td class="p-3 whitespace-nowrap">' + escHtml(r.platform) + '</td>' +
        '<td class="p-3">' + typePill + '</td>' +
        '<td class="p-3">' + repeatBadge + '</td>' +
        '<td class="p-3 whitespace-nowrap">' + stars(r.rating) + '</td>' +
        '<td class="p-3 min-w-[280px]">' + escHtml(r.notes) + '</td>' +
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

  for (var i = 0; i < list.length; i++) {
    var w = list[i];
    var total = Number(w.totalEpisodes || 0);
    var done = Number(w.watchedEpisodes || 0);
    var pct = total ? Math.min(100, Math.round((done / total) * 100)) : (w.watched ? 100 : 0);

    var badge;
    if (norm(w.kind) === "film") {
      badge = '<span class="px-2 py-1 rounded-full text-xs bg-indigo-600 text-white">Film</span>';
    } else {
      badge = '<span class="px-2 py-1 rounded-full text-xs bg-emerald-600 text-white">Season ' + escHtml(w.season) + '</span>';
    }

    var doneBadge = w.watched
      ? '<span class="px-2 py-1 rounded-full text-xs bg-green-600 text-white">Done</span>'
      : "";

    var toggleButton = norm(w.kind) === "film"
      ? '<button data-toggle="' + escHtml(w.id) + '" class="mt-2 w-full px-3 py-2 rounded-2xl border bg-white">Toggle done</button>'
      : "";

    var progressLabel = norm(w.kind) === "film"
      ? (w.watched ? "Watched" : "Not watched")
      : (done + "/" + total + " eps");

    host.insertAdjacentHTML("beforeend",
      '<div class="bg-white rounded-2xl border shadow-sm p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">' +
        '<div class="space-y-1">' +
          '<div class="flex flex-wrap items-center gap-2">' +
            '<div class="text-base font-semibold">' + escHtml(w.title) + '</div>' +
            '<span class="px-2 py-1 rounded-full text-xs bg-slate-200">' + escHtml(w.priority || "Medium") + '</span>' +
            badge +
            doneBadge +
          '</div>' +
          '<div class="text-sm text-slate-600">' + escHtml(w.notes) + '</div>' +
        '</div>' +
        '<div class="min-w-[240px]">' +
          '<div class="flex items-center justify-between text-sm mb-2">' +
            '<span>' + progressLabel + '</span>' +
            '<span class="text-slate-500">' + pct + '%</span>' +
          '</div>' +
          '<div class="h-2 w-full rounded-full bg-slate-200 overflow-hidden">' +
            '<div class="h-full bg-slate-900" style="width:' + pct + '%"></div>' +
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
      datasets: [{ label: "Items", data: data, backgroundColor: "#0f172a", borderRadius: 6 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 } },
        x: { ticks: { maxRotation: 45, minRotation: 45 } }
      }
    }
  });
}

// ====== MODAL / ADD ======
function openModal() {
  $("modal").classList.remove("hidden");
  var today = new Date();
  var yyyy = today.getFullYear();
  var mm = String(today.getMonth() + 1).padStart(2, "0");
  var dd = String(today.getDate()).padStart(2, "0");
  $("aDate").value = yyyy + "-" + mm + "-" + dd;
}

function closeModal() {
  $("modal").classList.add("hidden");
}

function saveEntry() {
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
      closeModal();
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
  // Tabs
  var tabBtns = document.querySelectorAll(".tab");
  for (var i = 0; i < tabBtns.length; i++) {
    tabBtns[i].addEventListener("click", function() {
      showTab(this.getAttribute("data-tab"));
    });
  }

  // Filters -> rerender
  var filterIds = ["fSearch", "fType", "fPlatform", "fRepeat", "fMinRating", "fFrom", "fTo"];
  for (var j = 0; j < filterIds.length; j++) {
    $(filterIds[j]).addEventListener("input", renderLog);
    $(filterIds[j]).addEventListener("change", renderLog);
  }

  // Modal
  $("btnAdd").addEventListener("click", openModal);
  $("modalClose").addEventListener("click", closeModal);
  $("btnSave").addEventListener("click", saveEntry);

  $("btnSetMovie").addEventListener("click", function() {
    $("aSeason").value = "movie";
    $("aEpisode").value = "movie";
  });
  $("btnSetSpecial").addEventListener("click", function() {
    $("aSeason").value = "special";
    $("aEpisode").value = "special";
  });

  // Sync
  $("btnSync").addEventListener("click", sync);

  // Initial load
  showTab("log");
  sync();
}

init();
