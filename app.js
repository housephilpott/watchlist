// ====== CONFIG ======
const API_BASE = "https://script.google.com/macros/s/AKfycbymzwZPQOCat8KEukI_G0Pg5-SpIXdfzuE_m5_YH50871phWX98YbzFY3dmonD41omz2Q/exec";

// ====== STATE ======
let LOG = [];
let WATCHLIST = [];
let chart;

// ====== HELPERS ======
const $ = (id) => document.getElementById(id);

function showError(msg) {
  const el = $("error");
  if (!msg) { el.classList.add("hidden"); el.textContent = ""; return; }
  el.textContent = msg;
  el.classList.remove("hidden");
}

function norm(s) { return String(s || "").trim().toLowerCase(); }

function inferType(season, episode) {
  const s = norm(season), e = norm(episode);
  if (s === "movie" || e === "movie") return "movie";
  if (s === "special" || e === "special") return "special";
  return "episode";
}

function parseDate(s) {
  const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function monthKey(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return "Unknown";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return d.getFullYear() + "-" + mm;
}

function stars(n) {
  const x = Number(n || 0);
  return x ? "\u2605".repeat(x) : "\u2014";
}

async function apiGet(path) {
  const res = await fetch(API_BASE + "?path=" + encodeURIComponent(path), {
    method: "GET",
    headers: { "Accept": "application/json" }
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(Object.assign({ path: path }, body))
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
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
  var rep = $("fRepeat").value;
  var minR = Number($("fMinRating").value || 0);
  var from = $("fFrom").value ? parseDate($("fFrom").value) : null;
  var to = $("fTo").value ? parseDate($("fTo").value) : null;

  return LOG.slice()
    .filter(function(r) {
      var t = inferType(r.season, r.episode);
      if (type !== "all" && t !== type) return false;

      var isRepeat = !!r.repeat;
      if (rep === "repeat" && !isRepeat) return false;
      if (rep === "first" && isRepeat) return false;

      if (Number(r.rating || 0) < minR) return false;

      var dv = parseDate(r.dateViewed);
      if (from && dv && dv < from) return false;
      if (to && dv && dv > to) return false;

      if (!s) return true;
      var hay = (r.title + " " + (r.notes || "")).toLowerCase();
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
    rows.innerHTML = '<tr><td colspan="8" class="p-6 text-center text-slate-500">No matches. Try clearing filters.</td></tr>';
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
        '<td class="p-3 whitespace-nowrap">' + (r.dateViewed || "") + '</td>' +
        '<td class="p-3 font-medium">' + (r.title || "") + '</td>' +
        '<td class="p-3 whitespace-nowrap">' + (r.season || "") + '</td>' +
        '<td class="p-3 whitespace-nowrap">' + (r.episode || "") + '</td>' +
        '<td class="p-3">' + typePill + '</td>' +
        '<td class="p-3">' + repeatBadge + '</td>' +
        '<td class="p-3 whitespace-nowrap">' + stars(r.rating) + '</td>' +
        '<td class="p-3 min-w-[320px]">' + (r.notes || "") + '</td>' +
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
      badge = '<span class="px-2 py-1 rounded-full text-xs bg-emerald-600 text-white">Season ' + w.season + '</span>';
    }

    var doneBadge = w.watched
      ? '<span class="px-2 py-1 rounded-full text-xs bg-green-600 text-white">Done</span>'
      : "";

    var toggleButton = norm(w.kind) === "film"
      ? '<button data-toggle="' + w.id + '" class="mt-2 w-full px-3 py-2 rounded-2xl border bg-white">Toggle done</button>'
      : "";

    var progressLabel = norm(w.kind) === "film"
      ? (w.watched ? "Watched" : "Not watched")
      : (done + "/" + total + " eps");

    host.insertAdjacentHTML("beforeend",
      '<div class="bg-white rounded-2xl border shadow-sm p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">' +
        '<div class="space-y-1">' +
          '<div class="flex flex-wrap items-center gap-2">' +
            '<div class="text-base font-semibold">' + w.title + '</div>' +
            '<span class="px-2 py-1 rounded-full text-xs bg-slate-200">' + (w.priority || "Medium") + '</span>' +
            badge +
            doneBadge +
          '</div>' +
          '<div class="text-sm text-slate-600">' + (w.notes || "") + '</div>' +
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

async function saveEntry() {
  showError("");

  var row = {
    dateViewed: $("aDate").value,
    title: $("aTitle").value.trim(),
    season: $("aSeason").value.trim(),
    episode: $("aEpisode").value.trim(),
    repeat: $("aRepeat").checked,
    rating: Number($("aRating").value || 0),
    notes: $("aNotes").value.trim()
  };

  if (!row.title) { showError("Title is required."); return; }
  if (!row.season) row.season = "1";
  if (!row.episode) row.episode = "1";

  try {
    var resp = await apiPost("addLog", { row: row });
    if (!resp.ok) throw new Error(resp.error || "Save failed");
    await sync();
    closeModal();
    $("aTitle").value = "";
    $("aSeason").value = "";
    $("aEpisode").value = "";
    $("aRepeat").checked = false;
    $("aRating").value = "";
    $("aNotes").value = "";
  } catch (e) {
    showError(String(e));
  }
}

// ====== SYNC ======
async function sync() {
  showError("");
  try {
    var resp = await apiGet("log");
    if (!resp.ok) throw new Error(resp.error || "Sync failed");
    LOG = resp.log || [];
    WATCHLIST = resp.watchlist || [];
    renderLog();
    renderWatchlist();
    renderStats();
  } catch (e) {
    showError(String(e));
  }
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
  var filterIds = ["fSearch", "fType", "fRepeat", "fMinRating", "fFrom", "fTo"];
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
