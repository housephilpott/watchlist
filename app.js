// ====== CONFIG ======
var API_BASE = "https://script.google.com/macros/s/AKfycbymzwZPQOCat8KEukI_G0Pg5-SpIXdfzuE_m5_YH50871phWX98YbzFY3dmonD41omz2Q/exec";
var TMDB_KEY = "f1c1f572df4b1c140d845e056fdcb05f";
var TMDB_IMG = "https://image.tmdb.org/t/p/w200";
var TMDB_IMG_LG = "https://image.tmdb.org/t/p/w780";
var TMDB_SEARCH = "https://api.themoviedb.org/3/search/multi";
var LOG_PAGE_SIZE = 10;
var WL_PAGE_SIZE = 10;
var CACHE_KEY = "watchlog_tmdb_cache";
var GENRE_KEY = "watchlog_genre_map";

var LOG = [], WATCHLIST = [], chart, logVisible = LOG_PAGE_SIZE, wlVisible = WL_PAGE_SIZE;
var tmdbCache = {}, genreMap = {}, fetching = {};

function $(id) { return document.getElementById(id); }
function showError(msg) {
  var el = $("error");
  if (!msg) { el.classList.add("hidden"); el.textContent = ""; return; }
  el.textContent = msg; el.classList.remove("hidden");
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
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
function todayYMD() {
  var t = new Date();
  return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0");
}
function stars(n) { var x = Number(n || 0); return x ? "\u2605".repeat(x) : "\u2014"; }
function escHtml(s) { var d = document.createElement("div"); d.textContent = String(s || ""); return d.innerHTML; }
function posterIcon(type) {
  if (type === "movie") return "\uD83C\uDFAC";
  if (type === "special") return "\uD83C\uDFA4";
  return "\uD83D\uDCFA";
}

// ====== API ======
function apiGet(path) {
  return fetch(API_BASE + "?path=" + encodeURIComponent(path), { method: "GET", headers: { "Accept": "application/json" } })
    .then(function(r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
}
function apiPost(path, body) {
  var payload = Object.assign({ path: path }, body);
  return fetch(API_BASE, { method: "POST", redirect: "follow", body: JSON.stringify(payload) })
    .then(function(r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
}

// ====== TMDB CACHE ======
function loadCache() {
  try {
    var raw = localStorage.getItem(CACHE_KEY);
    if (raw) tmdbCache = JSON.parse(raw);
    var old = localStorage.getItem("watchlog_poster_cache");
    if (old) {
      var od = JSON.parse(old);
      for (var k in od) {
        if (!tmdbCache[k]) {
          tmdbCache[k] = od[k] === "none" ? { posterUrl: null } : (typeof od[k] === "string" ? { posterUrl: od[k] } : od[k]);
        }
      }
      localStorage.removeItem("watchlog_poster_cache");
      saveCache();
    }
  } catch (e) { tmdbCache = {}; }
}
function saveCache() { try { localStorage.setItem(CACHE_KEY, JSON.stringify(tmdbCache)); } catch(e){} }
function getTmdb(title) { return tmdbCache[norm(title)] || null; }

// ====== GENRE MAP ======
function loadGenreMap() {
  try { var r = localStorage.getItem(GENRE_KEY); if (r) { genreMap = JSON.parse(r); return; } } catch(e){}
  var u1 = "https://api.themoviedb.org/3/genre/movie/list?api_key=" + TMDB_KEY;
  var u2 = "https://api.themoviedb.org/3/genre/tv/list?api_key=" + TMDB_KEY;
  Promise.all([fetch(u1).then(function(r){return r.json();}), fetch(u2).then(function(r){return r.json();})])
    .then(function(res) {
      genreMap = {};
      for (var i = 0; i < 2; i++) { var gs = (res[i] && res[i].genres) || []; for (var g = 0; g < gs.length; g++) genreMap[gs[g].id] = gs[g].name; }
      try { localStorage.setItem(GENRE_KEY, JSON.stringify(genreMap)); } catch(e){}
    }).catch(function(){});
}
function genreColor(name) {
  var n = norm(name);
  if (n.indexOf("action") !== -1 || n.indexOf("adventure") !== -1) return "bg-red-500/20 text-red-300";
  if (n.indexOf("comedy") !== -1) return "bg-amber-500/20 text-amber-300";
  if (n.indexOf("drama") !== -1) return "bg-blue-500/20 text-blue-300";
  if (n.indexOf("sci") !== -1 || n.indexOf("fantasy") !== -1) return "bg-cyan-500/20 text-cyan-300";
  if (n.indexOf("horror") !== -1) return "bg-purple-500/20 text-purple-300";
  if (n.indexOf("romance") !== -1) return "bg-pink-500/20 text-pink-300";
  if (n.indexOf("document") !== -1) return "bg-green-500/20 text-green-300";
  if (n.indexOf("animat") !== -1) return "bg-orange-500/20 text-orange-300";
  if (n.indexOf("thriller") !== -1) return "bg-slate-500/20 text-slate-300";
  if (n.indexOf("crime") !== -1 || n.indexOf("mystery") !== -1) return "bg-violet-500/20 text-violet-300";
  return "bg-faint/30 text-slate-400";
}
function genrePills(ids, max) {
  if (!ids || !ids.length) return "";
  var h = "", c = Math.min(ids.length, max || 3);
  for (var i = 0; i < c; i++) { var n = genreMap[ids[i]] || ""; if (n) h += '<span class="px-2 py-0.5 rounded-full text-xs ' + genreColor(n) + '">' + escHtml(n) + '</span>'; }
  return h;
}

// ====== TMDB FETCH ======
function buildTmdbEntry(f) {
  var yr = (f.release_date || f.first_air_date || "").substring(0, 4);
  return {
    posterUrl: f.poster_path ? TMDB_IMG + f.poster_path : null,
    overview: f.overview || "",
    tmdbRating: f.vote_average || 0,
    genreIds: f.genre_ids || [],
    mediaType: f.media_type || "",
    tmdbId: f.id,
    year: yr,
    backdropUrl: f.backdrop_path ? TMDB_IMG_LG + f.backdrop_path : null
  };
}

function fetchTmdbForTitles(titles, cb) {
  var q = [];
  for (var i = 0; i < titles.length; i++) {
    var k = norm(titles[i]);
    if (k && !tmdbCache[k] && !fetching[k]) { fetching[k] = true; q.push({ key: k, title: titles[i] }); }
  }
  if (!q.length) { if (cb) cb(); return; }
  var idx = 0;
  function next() {
    if (idx >= q.length) { saveCache(); if (cb) cb(); return; }
    var item = q[idx++];
    fetch(TMDB_SEARCH + "?api_key=" + TMDB_KEY + "&query=" + encodeURIComponent(item.title) + "&page=1")
      .then(function(r){return r.json();}).then(function(data) {
        var f = null;
        if (data.results) { for (var r = 0; r < data.results.length; r++) { if (data.results[r].poster_path) { f = data.results[r]; break; } } }
        if (f) {
          tmdbCache[item.key] = buildTmdbEntry(f);
        } else { tmdbCache[item.key] = { posterUrl: null }; }
        delete fetching[item.key];
      }).catch(function() { tmdbCache[item.key] = { posterUrl: null }; delete fetching[item.key]; })
      .then(function() { setTimeout(next, 250); });
  }
  next();
}

function posterHtml(title, type) {
  var d = getTmdb(title);
  if (d && d.posterUrl) return '<img src="' + escHtml(d.posterUrl) + '" alt="" class="w-20 h-28 object-cover rounded-xl flex-shrink-0" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'" /><div class="w-20 h-28 bg-surface rounded-xl items-center justify-center text-3xl select-none flex-shrink-0" style="display:none">' + posterIcon(type) + '</div>';
  var k = norm(title);
  if (k && !tmdbCache[k] && !fetching[k]) return '<div class="w-20 h-28 bg-surface rounded-xl animate-pulse flex-shrink-0"></div>';
  return '<div class="w-20 h-28 bg-surface rounded-xl flex items-center justify-center text-3xl select-none flex-shrink-0">' + posterIcon(type) + '</div>';
}
function tmdbRatingHtml(title) {
  var d = getTmdb(title);
  if (d && d.tmdbRating) return ' <span class="text-xs text-muted">\u00b7 ' + d.tmdbRating.toFixed(1) + ' TMDB</span>';
  return "";
}
function overviewHtml(title) {
  var d = getTmdb(title);
  if (d && d.overview) return '<div class="overview-text line-clamp-2 text-xs text-slate-400 mt-1 cursor-pointer italic" data-expanded="false">' + escHtml(d.overview) + '</div>';
  return "";
}
function yearDisplay(row) {
  var y = row.year || "";
  if (!y) { var td = getTmdb(row.title); if (td && td.year) y = td.year; }
  return y ? ' <span class="text-muted font-normal">(' + escHtml(y) + ')</span>' : "";
}

// ====== NAVIGATION ======
function showTab(name) {
  ["home","log","watchlist","stats"].forEach(function(t) {
    var el = $("tab-" + t);
    if (t === name) el.classList.remove("hidden"); else el.classList.add("hidden");
  });
  window.scrollTo(0, 0);
}

// ====== FILTER + LOG ======
function getFilteredLog() {
  var s = norm($("fSearch").value), type = $("fType").value, platform = $("fPlatform").value;
  var rep = $("fRepeat").value, minR = Number($("fMinRating").value || 0);
  var from = $("fFrom").value ? parseDate($("fFrom").value) : null;
  var to = $("fTo").value ? parseDate($("fTo").value) : null;
  return LOG.slice().filter(function(r) {
    var t = inferType(r.season, r.episode);
    if (type !== "all" && t !== type) return false;
    if (platform !== "all" && norm(r.platform) !== norm(platform)) return false;
    if (rep === "repeat" && !r.repeat) return false;
    if (rep === "first" && r.repeat) return false;
    if (Number(r.rating || 0) < minR) return false;
    var dv = parseDate(r.dateViewed);
    if (from && dv && dv < from) return false;
    if (to && dv && dv > to) return false;
    if (!s) return true;
    return (r.title + " " + (r.episodeTitle || "") + " " + (r.notes || "") + " " + (r.year || "")).toLowerCase().indexOf(s) !== -1;
  }).sort(function(a, b) { return String(b.dateViewed).localeCompare(String(a.dateViewed)); });
}

function renderLog() {
  var host = $("logTiles"); host.innerHTML = "";
  var data = getFilteredLog(), total = data.length, showing = Math.min(logVisible, total);
  $("count").textContent = "(" + total + ")";
  if (!total) { $("logEmpty").classList.remove("hidden"); $("logLoadMore").classList.add("hidden"); return; }
  $("logEmpty").classList.add("hidden");
  var tf = [];
  for (var i = 0; i < showing; i++) {
    var r = data[i], t = inferType(r.season, r.episode), td = getTmdb(r.title);
    var tp = t==="movie"?'<span class="px-2 py-0.5 rounded-full text-xs bg-indigo-500/20 text-indigo-300">Movie</span>':t==="special"?'<span class="px-2 py-0.5 rounded-full text-xs bg-fuchsia-500/20 text-fuchsia-300">Special</span>':'<span class="px-2 py-0.5 rounded-full text-xs bg-slate-500/20 text-slate-300">Episode</span>';
    var rb = r.repeat?' <span class="px-2 py-0.5 rounded-full text-xs bg-amber-500/20 text-amber-300">[r]</span>':"";
    var se = "";
    if (t==="episode") { se = "S"+escHtml(r.season)+" E"+escHtml(r.episode); if(r.episodeTitle) se += ' \u00b7 <span class="text-slate-300">'+escHtml(r.episodeTitle)+'</span>'; }
    else if (r.episodeTitle) se = '<span class="text-slate-300">'+escHtml(r.episodeTitle)+'</span>';
    var gp = td ? genrePills(td.genreIds, 3) : "";
    var nh = r.notes ? '<div class="notes-text line-clamp-2 text-xs text-slate-400 mt-1 cursor-pointer" data-expanded="false">'+escHtml(r.notes)+'</div>' : "";
    if (r.title && norm(r.title) && !tmdbCache[norm(r.title)]) tf.push(r.title);
    host.insertAdjacentHTML("beforeend",
      '<div class="bg-card rounded-2xl p-3 flex gap-3 relative">'+
      '<button class="edit-btn absolute top-2 right-2 w-7 h-7 rounded-full bg-surface/80 flex items-center justify-center text-xs text-muted hover:text-white transition" data-edit-idx="'+i+'">\u270F</button>'+
      '<div class="flex-shrink-0 cursor-pointer" data-detail-title="'+escHtml(r.title)+'">'+posterHtml(r.title,t)+'</div>'+
      '<div class="flex-1 min-w-0">'+
        '<div class="font-semibold text-white text-sm leading-snug truncate cursor-pointer hover:underline" data-detail-title="'+escHtml(r.title)+'">'+escHtml(r.title)+yearDisplay(r)+'</div>'+
        (se?'<div class="text-xs text-muted mt-0.5">'+se+'</div>':'')+
        (gp?'<div class="flex flex-wrap gap-1 mt-1">'+gp+'</div>':'')+
        '<div class="flex items-center gap-1 mt-1"><span class="text-amber-400 text-xs">'+stars(r.rating)+'</span>'+tmdbRatingHtml(r.title)+(r.platform?' <span class="text-xs text-muted">\u00b7 '+escHtml(r.platform)+'</span>':'')+'</div>'+
        '<div class="flex flex-wrap items-center gap-1.5 mt-1"><span class="text-xs text-faint">'+escHtml(r.dateViewed)+'</span>'+tp+rb+'</div>'+
        overviewHtml(r.title)+nh+
      '</div></div>'
    );
  }
  attachExpandHandlers(host);
  attachDetailHandlers(host);

var ebs = host.querySelectorAll(".edit-btn");
for (var e = 0; e < ebs.length; e++) {
  ebs[e].addEventListener(
    "click",
    (function(idx) {
      return function(ev) {
        ev.stopPropagation();
        openEditModal(data[idx]);
      };
    })(Number(ebs[e].getAttribute("data-edit-idx")))
  );
}

if (showing < total) {
  $("logLoadMore").classList.remove("hidden");
  $("logShowing").textContent =
    "Showing " + showing + " of " + total;
}
else {
  $("logLoadMore").classList.add("hidden");
}

if (tf.length) {
  fetchTmdbForTitles(tf, function() {
    renderLog();
  });
}

// ====== WATCHLIST ======
function computeWLProgress() {
  var epSets = {}, movieT = {};
  for (var i = 0; i < LOG.length; i++) {
    var r = LOG[i], t = inferType(r.season, r.episode);
    if (t === "movie") movieT[norm(r.title)] = true;
    if (t !== "episode") continue;
    var key = norm(r.title) + "|" + String(r.season || "").trim();
    if (!epSets[key]) epSets[key] = {};
    epSets[key][String(r.episode || "").trim()] = true;
  }
  return WATCHLIST.map(function(w) {
    var kind = norm(w.kind) || "season";
    if (kind === "film") {
      var done = !!movieT[norm(w.title)] || !!w.manualDone;
      return Object.assign({}, w, { watched: done, watchedEps: done ? 1 : 0, totalEps: 1 });
    }
    var key = norm(w.title) + "|" + String(w.season || "").trim();
    var eps = epSets[key], we = eps ? Object.keys(eps).length : 0, tot = Number(w.totalEpisodes || 0);
    return Object.assign({}, w, { watched: tot ? we >= tot : we > 0, watchedEps: we, totalEps: tot });
  }).sort(function(a, b) {
    var p = { high: 0, medium: 1, low: 2 }, pa = p[norm(a.priority)], pb = p[norm(b.priority)];
    if (pa === undefined) pa = 9; if (pb === undefined) pb = 9;
    if (pa !== pb) return pa - pb;
    return String(a.title).localeCompare(String(b.title));
  });
}

function getNextEp(title, season) {
  var hi = 0;
  for (var i = 0; i < LOG.length; i++) {
    var r = LOG[i];
    if (norm(r.title) === norm(title) && String(r.season || "").trim() === String(season || "").trim()) {
      var ep = parseInt(r.episode); if (!isNaN(ep) && ep > hi) hi = ep;
    }
  }
  return hi + 1;
}

function renderWatchlist() {
  var host = $("watchlistTiles");
  var notStartedHost = $("notStartedTiles");
  var completedHost = $("completedWatchlistTiles");

  host.innerHTML = "";
  if (notStartedHost) notStartedHost.innerHTML = "";
  if (completedHost) completedHost.innerHTML = "";

  var list = computeWLProgress();

  var inProgress = list.filter(function(w) {
    return !w.watched && Number(w.watchedEps || 0) > 0;
  });

  var notStarted = list.filter(function(w) {
    return !w.watched && Number(w.watchedEps || 0) === 0;
  });

  var completed = list.filter(function(w) {
    return w.watched;
  });

  var total = list.length;

  if (!total) {
    $("wlEmpty").classList.remove("hidden");
    $("wlLoadMore").classList.add("hidden");

    if ($("notStartedHeader")) $("notStartedHeader").style.display = "none";
    if ($("completedSection")) $("completedSection").style.display = "none";

    return;
  }

  $("wlEmpty").classList.add("hidden");
  $("wlLoadMore").classList.add("hidden");
  $("inProgressSection").style.display =
    inProgress.length ? "" : "none";

  if ($("notStartedHeader")) {
    $("notStartedSection").style.display =
    notStarted.length ? "" : "none";
  }

  if ($("completedSection")) {
    $("completedSection").style.display = completed.length ? "" : "none";
  }

  if ($("completedCount")) {
    $("completedCount").textContent = "(" + completed.length + ")";
  }

  var tf = [];

  function renderWatchlistItems(items, targetHost) {
    if (!targetHost) return;

    for (var i = 0; i < items.length; i++) {
      var w = items[i];
      var te = Number(w.totalEps || 0);
      var de = Number(w.watchedEps || 0);
      var pct = te ? Math.min(100, Math.round((de / te) * 100)) : (w.watched ? 100 : 0);

      var isF = norm(w.kind) === "film";
      var tType = isF ? "movie" : "episode";
      var td = getTmdb(w.title);
      var gp = td ? genrePills(td.genreIds, 3) : "";

      var kb = isF
        ? '<span class="px-2 py-0.5 rounded-full text-xs bg-indigo-500/20 text-indigo-300">Film</span>'
        : '<span class="px-2 py-0.5 rounded-full text-xs bg-emerald-500/20 text-emerald-300">Season ' + escHtml(w.season) + '</span>';

      var pcC = {
        High: "text-red-400",
        Medium: "text-amber-400",
        Low: "text-slate-400"
      };

      var pc = pcC[w.priority] || "text-muted";

      var db = w.watched
        ? '<span class="px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-300">Done</span>'
        : "";

      var bc = w.watched ? "bg-green-500" : "bg-accent";

      var pl = isF
        ? (w.watched ? "Watched" : "Not watched")
        : (de + "/" + te + " eps");

      var tb = isF
        ? '<button data-toggle="' + escHtml(w.id) + '" class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm transition active:scale-[0.9] ' +
          (w.watched
            ? 'bg-green-500 text-white'
            : 'bg-surface border border-faint text-faint hover:border-green-500 hover:text-green-400') +
          '">✓</button>'
        : "";

      var neb = (!isF && !w.watched)
        ? '<button data-next-title="' + escHtml(w.title) + '" data-next-season="' + escHtml(w.season) + '" class="flex-shrink-0 w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-sm text-accent hover:bg-accent/40 transition active:scale-[0.9]">⏭</button>'
        : "";

      var delBtn =
        '<button data-delete-watchlist="' + escHtml(w.id) + '" class="flex-shrink-0 w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center text-sm text-red-300 hover:bg-red-500/40 transition active:scale-[0.9]">🗑</button>';

      var nh = w.notes
        ? '<div class="notes-text line-clamp-2 text-xs text-slate-400 mt-1 cursor-pointer" data-expanded="false">' + escHtml(w.notes) + '</div>'
        : "";

      if (w.title && norm(w.title) && !tmdbCache[norm(w.title)]) {
        tf.push(w.title);
      }

      targetHost.insertAdjacentHTML(
        "beforeend",
        '<div class="bg-card rounded-2xl p-3 flex gap-3">' +
          '<div class="flex-shrink-0 cursor-pointer" data-detail-title="' + escHtml(w.title) + '">' +
            posterHtml(w.title, tType) +
          '</div>' +

          '<div class="flex-1 min-w-0">' +
            '<div class="flex items-start gap-2">' +
              '<div class="flex-1 min-w-0">' +
                '<div class="font-semibold text-white text-sm leading-snug truncate cursor-pointer hover:underline" data-detail-title="' + escHtml(w.title) + '">' +
                  escHtml(w.title) +
                '</div>' +

                '<div class="flex flex-wrap items-center gap-1.5 mt-1">' +
                  '<span class="px-2 py-0.5 rounded-full text-xs bg-surface ' + pc + '">' +
                    escHtml(w.priority || "Medium") +
                  '</span>' +
                  kb +
                  db +
                '</div>' +

                (gp ? '<div class="flex flex-wrap gap-1 mt-1">' + gp + '</div>' : '') +
              '</div>' +

              '<div class="flex gap-1">' + neb + tb + delBtn + '</div>' +
            '</div>' +

            tmdbRatingHtml(w.title) +

            '<div class="mt-2">' +
              '<div class="flex items-center justify-between text-xs mb-1">' +
                '<span class="text-slate-300">' + pl + '</span>' +
                '<span class="text-muted">' + pct + '%</span>' +
              '</div>' +

              '<div class="h-1.5 w-full rounded-full bg-surface overflow-hidden">' +
                '<div class="h-full ' + bc + ' rounded-full transition-all" style="width:' + pct + '%"></div>' +
              '</div>' +
            '</div>' +

            overviewHtml(w.title) +
            nh +
          '</div>' +
        '</div>'
      );
    }
  }

  renderWatchlistItems(inProgress, host);
  renderWatchlistItems(notStarted, notStartedHost);
  renderCompletedItems(completed, completedHost);

  function attachWatchlistHandlers(container) {
    if (!container) return;

    attachExpandHandlers(container);
    attachDetailHandlers(container);

    var dbs = container.querySelectorAll("[data-delete-watchlist]");
    for (var d = 0; d < dbs.length; d++) {
      dbs[d].addEventListener(
        "click",
        (function(btn) {
          return function(ev) {
            ev.stopPropagation();
            deleteWatchlistItem(
              btn.getAttribute("data-delete-watchlist")
            );
          };
        })(dbs[d])
      );
    }

    var tbs = container.querySelectorAll("[data-toggle]");
    for (var j = 0; j < tbs.length; j++) {
      tbs[j].addEventListener(
        "click",
        (function(btn) {
          return function(ev) {
            ev.stopPropagation();

            var id = btn.getAttribute("data-toggle");

            for (var k = 0; k < WATCHLIST.length; k++) {
              if (String(WATCHLIST[k].id) === String(id)) {
                WATCHLIST[k].manualDone = !WATCHLIST[k].manualDone;
                break;
              }
            }

            renderWatchlist();
          };
        })(tbs[j])
      );
    }

    var nbs = container.querySelectorAll("[data-next-title]");
    for (var n = 0; n < nbs.length; n++) {
      nbs[n].addEventListener(
        "click",
        (function(btn) {
          return function(ev) {
            ev.stopPropagation();
            addNextEpisode(
              btn.getAttribute("data-next-title"),
              btn.getAttribute("data-next-season")
            );
          };
        })(nbs[n])
      );
    }
  }

  attachWatchlistHandlers(host);
  attachWatchlistHandlers(notStartedHost);
  attachWatchlistHandlers(completedHost);

  if (tf.length) {
    fetchTmdbForTitles(tf, function() {
      renderWatchlist();
    });
  }
}

// ====== SHARED HANDLERS ======
function attachExpandHandlers(host) {
  var els = host.querySelectorAll(".notes-text, .overview-text");
  for (var i = 0; i < els.length; i++) els[i].addEventListener("click", function(ev) {
    ev.stopPropagation();
    var exp = this.getAttribute("data-expanded") === "true";
    if (exp) { this.classList.remove("line-clamp-none"); this.classList.add("line-clamp-2"); this.setAttribute("data-expanded","false"); }
    else { this.classList.remove("line-clamp-2"); this.classList.add("line-clamp-none"); this.setAttribute("data-expanded","true"); }
  });
}
function attachDetailHandlers(host) {
  var els = host.querySelectorAll("[data-detail-title]");
  for (var i = 0; i < els.length; i++) els[i].addEventListener("click", function(ev) {
    ev.stopPropagation(); var t = this.getAttribute("data-detail-title"); if (t) openDetailView(t);
  });
}

// ====== DETAIL VIEW ======
function openDetailView(title) {
  var td = getTmdb(title);
  if (!td || !td.tmdbId) {
    var key = norm(title);
    if (key) delete tmdbCache[key];
    fetchTmdbForTitles([title], function() {
      var td2 = getTmdb(title);
      if (td2 && td2.tmdbId) { openDetailView(title); }
      else { showError("Could not find this title on TMDB."); }
    });
    return;
  }
  var mt = td.mediaType === "movie" ? "movie" : "tv";
  var url = "https://api.themoviedb.org/3/" + mt + "/" + td.tmdbId + "?api_key=" + TMDB_KEY + "&append_to_response=credits";
  $("detailContent").innerHTML = '<div class="p-8 text-center text-muted">Loading...</div>';
  $("modalDetail").classList.remove("hidden");
  fetch(url).then(function(r){return r.json();}).then(function(d) {
    var bk = d.backdrop_path ? TMDB_IMG_LG + d.backdrop_path : "";
    var ps = d.poster_path ? TMDB_IMG + d.poster_path : "";
    var nm = d.title || d.name || title;
    var tl = d.tagline || "";
    var ov = d.overview || td.overview || "";
    var rt = d.vote_average ? d.vote_average.toFixed(1) : "";
    var rm = d.runtime ? d.runtime + " min" : (d.episode_run_time && d.episode_run_time[0] ? d.episode_run_time[0] + " min/ep" : "");
    var st = d.status || "";
    var yr = (d.release_date || d.first_air_date || "").substring(0, 4);
    var gh = "";
    if (d.genres) { for (var g = 0; g < d.genres.length; g++) { var gn = d.genres[g].name; gh += '<span class="px-2 py-0.5 rounded-full text-xs ' + genreColor(gn) + '">' + escHtml(gn) + '</span>'; } }
    var ch = "", cast = (d.credits && d.credits.cast) || [], cc = Math.min(cast.length, 10);
    if (cc) {
      ch = '<div class="mt-4"><h4 class="text-sm font-semibold text-white mb-2">Top Cast</h4><div class="flex gap-3 overflow-x-auto pb-2 cast-scroll">';
      for (var c = 0; c < cc; c++) {
        var pi = cast[c].profile_path ? '<img src="'+TMDB_IMG+cast[c].profile_path+'" class="w-14 h-14 rounded-full object-cover" />' : '<div class="w-14 h-14 rounded-full bg-faint flex items-center justify-center text-xs text-muted">\uD83D\uDC64</div>';
        ch += '<div class="flex-shrink-0 text-center w-16">' + pi + '<div class="text-xs text-white mt-1 truncate">' + escHtml(cast[c].name) + '</div><div class="text-xs text-muted truncate">' + escHtml(cast[c].character || "") + '</div></div>';
      }
      ch += '</div></div>';
    }
    var entries = LOG.filter(function(r) { return norm(r.title) === norm(title); });
    var eh = "";
    if (entries.length) {
      entries.sort(function(a,b){ return String(b.dateViewed).localeCompare(String(a.dateViewed)); });
      eh = '<div class="mt-4"><h4 class="text-sm font-semibold text-white mb-2">Your Entries (' + entries.length + ')</h4><div class="space-y-2">';
      var sc = Math.min(entries.length, 20);
      for (var e = 0; e < sc; e++) {
        var en = entries[e], et = inferType(en.season, en.episode);
        var ei = et === "episode" ? "S"+en.season+" E"+en.episode : (et === "movie" ? "Movie" : "Special");
        if (en.episodeTitle) ei += " \u00b7 " + escHtml(en.episodeTitle);
        eh += '<div class="bg-card rounded-xl p-2.5 text-xs"><div class="flex justify-between"><span class="text-white">'+ei+'</span><span class="text-amber-400">'+stars(en.rating)+'</span></div><div class="text-muted mt-0.5">'+escHtml(en.dateViewed)+(en.platform?" \u00b7 "+escHtml(en.platform):"")+(en.repeat?" \u00b7 [r]":"")+'</div>'+(en.notes?'<div class="text-slate-400 mt-0.5">'+escHtml(en.notes)+'</div>':'')+'</div>';
      }
      if (entries.length > 20) eh += '<div class="text-xs text-muted text-center">...and '+(entries.length-20)+' more</div>';
      eh += '</div></div>';
    }
    $("detailContent").innerHTML =
      (bk ? '<div class="relative h-48 overflow-hidden"><img src="'+escHtml(bk)+'" class="w-full h-full object-cover" /><div class="absolute inset-0 bg-gradient-to-t from-base to-transparent"></div></div>' : '<div class="h-12"></div>') +
      '<div class="px-4">' +
        '<button id="detailClose" class="fixed top-4 right-4 w-10 h-10 rounded-full bg-surface/90 flex items-center justify-center text-xl text-white z-10 hover:bg-faint transition">&times;</button>' +
        '<div class="flex gap-4 '+(bk?'-mt-16 relative z-10':'')+'">'+
          (ps ? '<img src="'+escHtml(ps)+'" class="w-28 h-40 object-cover rounded-xl shadow-lg flex-shrink-0" />' : '') +
          '<div class="'+(bk?'pt-16':'')+'"><h2 class="text-xl font-bold text-white">'+escHtml(nm)+'</h2>'+(tl?'<div class="text-sm text-muted italic mt-0.5">'+escHtml(tl)+'</div>':'')+
          '<div class="flex flex-wrap items-center gap-2 mt-2">'+(yr?'<span class="text-xs text-muted">'+yr+'</span>':'')+(rm?'<span class="text-xs text-muted">\u00b7 '+rm+'</span>':'')+(st?'<span class="text-xs text-muted">\u00b7 '+escHtml(st)+'</span>':'')+(rt?'<span class="text-xs text-amber-400">\u2605 '+rt+'/10</span>':'')+'</div></div></div>'+
        (gh?'<div class="flex flex-wrap gap-1.5 mt-3">'+gh+'</div>':'')+
        (ov?'<p class="text-sm text-slate-300 mt-3 leading-relaxed">'+escHtml(ov)+'</p>':'')+
        ch + eh +
      '</div>';
    $("detailClose").addEventListener("click", function() { $("modalDetail").classList.add("hidden"); });
  }).catch(function() {
    $("detailContent").innerHTML = '<div class="p-8 text-center text-muted">Failed to load details.</div><div class="text-center mt-4"><button id="detailClose" class="px-4 py-2 rounded-xl bg-card border border-faint text-white">Close</button></div>';
    $("detailClose").addEventListener("click", function() { $("modalDetail").classList.add("hidden"); });
  });
}

// ====== STATS ======
function renderStats() {
  var counts = {};
  for (var i = 0; i < LOG.length; i++) { var k = monthKey(LOG[i].dateViewed); counts[k] = (counts[k]||0)+1; }
  var labels = [], data = [], cur = new Date(2018,0,1), end = new Date();
  while (cur <= end) { var mm = String(cur.getMonth()+1).padStart(2,"0"); var k = cur.getFullYear()+"-"+mm; labels.push(k); data.push(counts[k]||0); cur.setMonth(cur.getMonth()+1); }
  if (counts["Unknown"]) { labels.push("Unknown"); data.push(counts["Unknown"]); }
  var ctx = $("chart").getContext("2d");
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "bar",
    data: { labels: labels, datasets: [{ label: "Items", data: data, backgroundColor: "#f59e0b", borderRadius: 4, borderSkipped: false }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0, color: "#94a3b8" }, grid: { color: "#334155" } }, x: { ticks: { maxRotation: 45, minRotation: 45, color: "#94a3b8", font: { size: 10 } }, grid: { display: false } } }
    }
  });
}

// ====== TMDB PICKER ======
function openTmdbPicker() {
  var q = $("aTitle").value.trim();
  $("tmdbPickerSearch").value = q;
  $("tmdbPickerResults").innerHTML = "";
  $("modalTmdbPicker").classList.remove("hidden");
  if (q) doTmdbPickerSearch(q);
}
function closeTmdbPicker() { $("modalTmdbPicker").classList.add("hidden"); }

function doTmdbPickerSearch(query) {
  if (!query) return;
  $("tmdbPickerResults").innerHTML = '<div class="text-center text-muted py-4">Searching...</div>';
  fetch(TMDB_SEARCH + "?api_key=" + TMDB_KEY + "&query=" + encodeURIComponent(query) + "&page=1")
    .then(function(r){return r.json();}).then(function(data) {
      var results = (data.results || []).filter(function(r) { return r.media_type === "movie" || r.media_type === "tv"; }).slice(0, 10);
      if (!results.length) { $("tmdbPickerResults").innerHTML = '<div class="text-center text-muted py-4">No results found.</div>'; return; }
      var h = "";
      for (var i = 0; i < results.length; i++) {
        var r = results[i];
        var nm = r.title || r.name || "Unknown";
        var yr = (r.release_date || r.first_air_date || "").substring(0, 4);
        var mt = r.media_type === "movie" ? "Movie" : "TV";
        var pImg = r.poster_path ? '<img src="'+TMDB_IMG+r.poster_path+'" class="w-12 h-16 object-cover rounded-lg flex-shrink-0" />' : '<div class="w-12 h-16 bg-surface rounded-lg flex items-center justify-center text-lg flex-shrink-0">\uD83C\uDFAC</div>';
        var ov = r.overview ? escHtml(r.overview).substring(0, 120) + (r.overview.length > 120 ? "..." : "") : "";
        h += '<button class="tmdb-pick-btn w-full text-left bg-card hover:bg-faint rounded-xl p-2.5 flex gap-3 transition" data-pick-idx="'+i+'">' +
          pImg +
          '<div class="flex-1 min-w-0">' +
            '<div class="font-semibold text-white text-sm truncate">'+escHtml(nm)+'</div>' +
            '<div class="text-xs text-muted">'+(yr?yr+" \u00b7 ":"")+mt+'</div>' +
            (ov?'<div class="text-xs text-slate-400 mt-0.5 line-clamp-2">'+ov+'</div>':'') +
          '</div></button>';
      }
      $("tmdbPickerResults").innerHTML = h;
      var btns = $("tmdbPickerResults").querySelectorAll(".tmdb-pick-btn");
      for (var b = 0; b < btns.length; b++) {
        btns[b].addEventListener("click", (function(idx) { return function() {
          var picked = results[idx];
          var titleKey = norm($("aTitle").value);
          if (!titleKey) titleKey = norm(picked.title || picked.name);
          tmdbCache[titleKey] = buildTmdbEntry(picked);
          saveCache();
          var yr = (picked.release_date || picked.first_air_date || "").substring(0, 4);
          if (yr) $("aYear").value = yr;
          closeTmdbPicker();
          showError("");
        }; })(b));
      }
    }).catch(function() {
      $("tmdbPickerResults").innerHTML = '<div class="text-center text-red-400 py-4">Search failed. Try again.</div>';
    });
}

// ====== WATCHLIST TMDB PICKER ======
function openWlPicker() {
  var q = $("wTitle").value.trim();
  $("wlPickerSearch").value = q;
  $("wlPickerResults").innerHTML = "";
  $("modalWlPicker").classList.remove("hidden");
  if (q) doWlPickerSearch(q);
}

function closeWlPicker() {
  $("modalWlPicker").classList.add("hidden");
}

function doWlPickerSearch(query) {
  if (!query) return;

  $("wlPickerResults").innerHTML = '<div class="text-center text-muted py-4">Searching...</div>';

  fetch(TMDB_SEARCH + "?api_key=" + TMDB_KEY + "&query=" + encodeURIComponent(query) + "&page=1")
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var results = (data.results || [])
        .filter(function(r) {
          return r.media_type === "movie" || r.media_type === "tv";
        })
        .slice(0, 10);

      if (!results.length) {
        $("wlPickerResults").innerHTML = '<div class="text-center text-muted py-4">No results found.</div>';
        return;
      }

      var h = "";

      for (var i = 0; i < results.length; i++) {
        var r = results[i];
        var nm = r.title || r.name || "Unknown";
        var yr = (r.release_date || r.first_air_date || "").substring(0, 4);
        var mt = r.media_type === "movie" ? "Movie" : "TV";
        var pImg = r.poster_path
          ? '<img src="' + TMDB_IMG + r.poster_path + '" class="w-12 h-16 object-cover rounded-lg flex-shrink-0" />'
          : '<div class="w-12 h-16 bg-surface rounded-lg flex items-center justify-center text-lg flex-shrink-0">🎬</div>';
        var ov = r.overview
          ? escHtml(r.overview).substring(0, 120) + (r.overview.length > 120 ? "..." : "")
          : "";

        h += '<button class="wl-pick-btn w-full text-left bg-card hover:bg-faint rounded-xl p-2.5 flex gap-3 transition" data-pick-idx="' + i + '">' +
          pImg +
          '<div class="flex-1 min-w-0">' +
            '<div class="font-semibold text-white text-sm truncate">' + escHtml(nm) + '</div>' +
            '<div class="text-xs text-muted">' + (yr ? yr + " · " : "") + mt + '</div>' +
            (ov ? '<div class="text-xs text-slate-400 mt-0.5 line-clamp-2">' + ov + '</div>' : '') +
          '</div>' +
        '</button>';
      }

      $("wlPickerResults").innerHTML = h;

      var btns = $("wlPickerResults").querySelectorAll(".wl-pick-btn");
      for (var b = 0; b < btns.length; b++) {
        btns[b].addEventListener("click", (function(idx) {
          return function() {
            var picked = results[idx];
            if (picked.media_type === "movie") {
              selectWlMovie(picked);
            } else {
              selectWlShow(picked);
            }
          };
        })(b));
      }
    })
    .catch(function(e) {
      console.error("Watchlist TMDB search failed:", e);
      $("wlPickerResults").innerHTML = '<div class="text-center text-red-400 py-4">Search failed. Try again.</div>';
    });
}

function cacheTmdbForTitle(title, result) {
  var key = norm(title);
  if (!key) return;

  tmdbCache[key] = {
    posterUrl: result.poster_path ? TMDB_IMG + result.poster_path : null,
    overview: result.overview || "",
    tmdbRating: result.vote_average || 0,
    genreIds: result.genre_ids || [],
    mediaType: result.media_type || "",
    tmdbId: result.id,
    year: (result.release_date || result.first_air_date || "").substring(0, 4),
    backdropUrl: result.backdrop_path ? TMDB_IMG_LG + result.backdrop_path : null
  };

  saveCache();
}

function selectWlMovie(result) {
  var title = result.title || result.name || "";

  $("wTitle").value = title;
  $("wKind").value = "film";
  $("wSeason").value = "movie";
  $("wTotal").value = "1";

  updateWKFields();
  cacheTmdbForTitle(title, result);
  closeWlPicker();

  showError("Film added from TMDB ✓");
}

function selectWlShow(result) {
  var title = result.name || result.title || "";

  $("wlPickerResults").innerHTML = '<div class="text-center text-muted py-4">Loading seasons...</div>';

  fetch("https://api.themoviedb.org/3/tv/" + result.id + "?api_key=" + TMDB_KEY)
    .then(function(r) { return r.json(); })
    .then(function(show) {
      var seasons = show.seasons || [];

      // Skip season 0 / specials unless it is the only available season
      var displaySeasons = seasons.filter(function(s) {
        return s.season_number !== 0;
      });
      if (!displaySeasons.length) displaySeasons = seasons;

      var h = "";

      h += '<button id="wlSeasonBack" class="text-sm text-accent mb-2">← Back to results</button>';
      h += '<div class="text-sm text-muted mb-2">Select a season for <span class="text-white font-semibold">' + escHtml(title) + '</span></div>';

      for (var i = 0; i < displaySeasons.length; i++) {
        var s = displaySeasons[i];
        var label = s.name || ("Season " + s.season_number);
        var eps = Number(s.episode_count || 0);

        h += '<button class="wl-season-btn w-full text-left bg-card hover:bg-faint rounded-xl p-3 transition" data-season-idx="' + i + '">' +
          '<div class="font-semibold text-white text-sm">' + escHtml(label) + '</div>' +
          '<div class="text-xs text-muted">' + eps + ' episode' + (eps === 1 ? '' : 's') + '</div>' +
        '</button>';
      }

      $("wlPickerResults").innerHTML = h;

      $("wlSeasonBack").addEventListener("click", function() {
        doWlPickerSearch($("wlPickerSearch").value.trim());
      });

      var btns = $("wlPickerResults").querySelectorAll(".wl-season-btn");
      for (var b = 0; b < btns.length; b++) {
        btns[b].addEventListener("click", (function(idx) {
          return function() {
            selectWlSeason(result, displaySeasons[idx]);
          };
        })(b));
      }
    })
    .catch(function(e) {
      console.error("Season lookup failed:", e);
      $("wlPickerResults").innerHTML = '<div class="text-center text-red-400 py-4">Could not load seasons.</div>';
    });
}

function selectWlSeason(result, season) {
  var title = result.name || result.title || "";

  $("wTitle").value = title;
  $("wKind").value = "season";
  $("wSeason").value = String(season.season_number || "");
  $("wTotal").value = String(season.episode_count || 0);

  updateWKFields();
  cacheTmdbForTitle(title, result);
  closeWlPicker();

  showError("Season added from TMDB ✓");
}

// ====== MODALS ======
function resetLogModal() {
  $("modalLogTitle").textContent = "Add to Log"; $("btnSaveLog").textContent = "Save"; $("aEditId").value = "";
  $("btnDeleteLog").classList.add("hidden");
  $("aDate").value = todayYMD(); $("aTitle").value = ""; $("aSeason").value = ""; $("aEpisode").value = "";
  $("aEpTitle").value = ""; $("aYear").value = ""; $("aPlatform").value = ""; $("aRepeat").checked = false; $("aRating").value = ""; $("aNotes").value = "";
}
function openLogModal() { resetLogModal(); $("modalLog").classList.remove("hidden"); }
function openEditModal(entry) {
  $("modalLogTitle").textContent = "Edit Entry"; $("btnSaveLog").textContent = "Update";
  $("aEditId").value = entry.id || ""; $("aDate").value = entry.dateViewed || todayYMD();
  $("aTitle").value = entry.title || ""; $("aSeason").value = entry.season || "";
  $("aEpisode").value = entry.episode || ""; $("aEpTitle").value = entry.episodeTitle || "";
  $("aYear").value = entry.year || "";
  $("aPlatform").value = entry.platform || ""; $("aRepeat").checked = !!entry.repeat;
  $("aRating").value = entry.rating || ""; $("aNotes").value = entry.notes || "";
  $("btnDeleteLog").classList.remove("hidden");
  $("modalLog").classList.remove("hidden");
}
function closeLogModal() { $("modalLog").classList.add("hidden"); }
function openWatchlistModal() { $("modalWatchlist").classList.remove("hidden"); updateWKFields(); }
function closeWatchlistModal() { $("modalWatchlist").classList.add("hidden"); }
function updateWKFields() {
  var k = $("wKind").value;
  if (k==="film") { $("wSeasonGroup").classList.add("hidden"); $("wTotalGroup").classList.add("hidden"); }
  else { $("wSeasonGroup").classList.remove("hidden"); $("wTotalGroup").classList.remove("hidden"); }
}

function addNextEpisode(title, season) {
  var nxt = getNextEp(title, season);
  resetLogModal(); $("aTitle").value = title; $("aSeason").value = season; $("aEpisode").value = String(nxt);
  $("modalLog").classList.remove("hidden");
  setTimeout(autoFillEpTitle, 100);
}

function autoFillEpTitle() {
  var title = $("aTitle").value.trim(), season = $("aSeason").value.trim(), episode = $("aEpisode").value.trim();
  if (!title) { showError("Enter a title first."); return; }
  if (!season || !episode) { showError("Enter season and episode first."); return; }
  var td = getTmdb(title);
  if (!td || !td.tmdbId || td.mediaType !== "tv") {
    fetchTmdbForTitles([title], function() {
      var td2 = getTmdb(title);
      if (td2 && td2.tmdbId && td2.mediaType === "tv") doEpFetch(td2.tmdbId, season, episode);
      else showError("Could not find this show on TMDB.");
    });
    return;
  }
  doEpFetch(td.tmdbId, season, episode);
}
function doEpFetch(id, s, e) {
  fetch("https://api.themoviedb.org/3/tv/"+id+"/season/"+s+"/episode/"+e+"?api_key="+TMDB_KEY)
    .then(function(r){return r.json();}).then(function(d) {
      if (d.name) $("aEpTitle").value = d.name; else showError("Episode not found on TMDB.");
    }).catch(function() { showError("Could not fetch episode title."); });
}

function autoFillYear() {
  var title = $("aTitle").value.trim();
  if (!title) { showError("Enter a title first."); return; }
  var td = getTmdb(title);
  if (td && td.year) { $("aYear").value = td.year; return; }
  var key = norm(title);
  if (key) delete tmdbCache[key];
  fetchTmdbForTitles([title], function() {
    var td2 = getTmdb(title);
    if (td2 && td2.year) $("aYear").value = td2.year;
    else showError("Could not find year on TMDB.");
  });
}

function saveLogEntry() {
  showError("");
  var editId = $("aEditId").value;
  var row = { dateViewed: $("aDate").value, title: $("aTitle").value.trim(), season: $("aSeason").value.trim(),
    episode: $("aEpisode").value.trim(), episodeTitle: $("aEpTitle").value.trim(), year: $("aYear").value.trim(),
    platform: $("aPlatform").value, repeat: $("aRepeat").checked, rating: Number($("aRating").value||0), notes: $("aNotes").value.trim() };
  if (!row.title) { showError("Title is required."); return; }
  if (!row.season) row.season = "1"; if (!row.episode) row.episode = "1";
  var path = editId ? "editLog" : "addLog";
  var payload = editId ? { id: editId, row: row } : { row: row };
  apiPost(path, payload).then(function(r) { if(!r.ok) throw new Error(r.error||"Save failed"); return sync(); })
    .then(function() {  if (editId) { closeLogModal(); resetLogModal(); }  else { resetLogModal(); showError("Saved ✓"); }}).catch(function(e) { showError(String(e)); });
}

function deleteLogEntry() {
  var editId = $("aEditId").value;
  if (!editId) return;
  if (!confirm("Are you sure you want to delete this entry? This cannot be undone.")) return;
  apiPost("deleteLog", { id: editId }).then(function(r) { if(!r.ok) throw new Error(r.error||"Delete failed"); return sync(); })
    .then(function() { closeLogModal(); resetLogModal(); }).catch(function(e) { showError(String(e)); });
}

function deleteWatchlistItem(id) {
  if (!confirm("Remove this item from your watchlist?")) {
    return;
  }

  apiPost("deleteWatchlist", { id: id })
    .then(function(r) {
      if (!r.ok) {
        throw new Error(r.error || "Delete failed");
      }
      return sync();
    })
    .catch(function(e) {
      showError(String(e));
    });
}

function saveWatchlistEntry() {
  showError("");
  var kind = $("wKind").value, isF = kind === "film";
  var row = { kind: kind, title: $("wTitle").value.trim(),
    season: isF ? "movie" : ($("wSeason").value.trim() || "1"),
    totalEpisodes: isF ? 1 : (Number($("wTotal").value) || 0),
    priority: $("wPriority").value, notes: $("wNotes").value.trim(), manualDone: false };
  if (!row.title) { showError("Title is required."); return; }
  if (!isF && !row.totalEpisodes) { showError("Total episodes required."); return; }
  apiPost("addWatchlist", { row: row }).then(function(r) { if(!r.ok) throw new Error(r.error||"Save failed"); return sync(); })
    .then(function() { closeWatchlistModal(); $("wTitle").value=""; $("wKind").value="season"; $("wSeason").value=""; $("wTotal").value=""; $("wPriority").value="Medium"; $("wNotes").value=""; updateWKFields(); })
    .catch(function(e) { showError(String(e)); });
}

function renderCompletedItems(items, targetHost) {
  for (var i = 0; i < items.length; i++) {
    var w = items[i];

    targetHost.insertAdjacentHTML(
      "beforeend",
      '<div class="px-3 py-2 border-b border-faint/30 last:border-b-0">' +
        '<button class="w-full text-left text-sm text-slate-300 hover:text-white transition" ' +
        'data-detail-title="' + escHtml(w.title) + '">' +
          '✅ ' + escHtml(w.title) +
          (norm(w.kind)==="film"
            ? ''
            : ' S' + escHtml(w.season)) +
        '</button>' +
      '</div>'
    );
  }
}

// ====== SYNC ======
function sync() {
  showError("");
  return apiGet("log").then(function(r) {
    if (!r.ok) throw new Error(r.error || "Sync failed");
    LOG = r.log || []; WATCHLIST = r.watchlist || [];
    logVisible = LOG_PAGE_SIZE; wlVisible = WL_PAGE_SIZE;
    renderLog(); renderWatchlist(); renderStats();
  }).catch(function(e) { showError(String(e)); });
}

// ====== INIT ======
function init() {
  loadCache(); loadGenreMap();
  var navBtns = document.querySelectorAll(".nav-btn");
  for (var i = 0; i < navBtns.length; i++) navBtns[i].addEventListener("click", function() { var t = this.getAttribute("data-nav"); if(t) showTab(t); });
  var fIds = ["fSearch","fType","fPlatform","fRepeat","fMinRating","fFrom","fTo"];
  for (var j = 0; j < fIds.length; j++) {
    $(fIds[j]).addEventListener("input", function() { logVisible = LOG_PAGE_SIZE; renderLog(); });
    $(fIds[j]).addEventListener("change", function() { logVisible = LOG_PAGE_SIZE; renderLog(); });
  }
  $("btnLogMore").addEventListener("click", function() { logVisible += LOG_PAGE_SIZE; renderLog(); });
  // $("btnWlMore").addEventListener("click", function() { wlVisible += WL_PAGE_SIZE; renderWatchlist(); });
  $("homeAddLog").addEventListener("click", openLogModal);
  $("modalLogClose").addEventListener("click", closeLogModal);
  $("btnSaveLog").addEventListener("click", saveLogEntry);
  $("btnDeleteLog").addEventListener("click", deleteLogEntry);
  $("btnAutoFill").addEventListener("click", autoFillEpTitle);
  $("btnAutoFillYear").addEventListener("click", autoFillYear);
  $("btnTmdbPicker").addEventListener("click", openTmdbPicker);
  $("btnTmdbPickerSearch").addEventListener("click", function() { doTmdbPickerSearch($("tmdbPickerSearch").value.trim()); });
  $("tmdbPickerSearch").addEventListener("keydown", function(ev) { if (ev.key === "Enter") { ev.preventDefault(); doTmdbPickerSearch(this.value.trim()); } });
  $("modalTmdbPickerClose").addEventListener("click", closeTmdbPicker);
  $("btnSetMovie").addEventListener("click", function() { $("aSeason").value="movie"; $("aEpisode").value="movie"; });
  $("btnSetSpecial").addEventListener("click", function() { $("aSeason").value="special"; $("aEpisode").value="special"; });
  $("homeAddWatchlist").addEventListener("click", openWatchlistModal);
  $("modalWatchlistClose").addEventListener("click", closeWatchlistModal);
  $("btnSaveWatchlist").addEventListener("click", saveWatchlistEntry);
  $("wKind").addEventListener("change", updateWKFields);

  $("btnWlPicker").addEventListener("click", openWlPicker);
  $("modalWlPickerClose").addEventListener("click", closeWlPicker);
  $("btnWlPickerSearch").addEventListener("click", function() {
  doWlPickerSearch($("wlPickerSearch").value.trim());
  });
  $("wlPickerSearch").addEventListener("keydown", function(ev) {
  if (ev.key === "Enter") {
    ev.preventDefault();
    doWlPickerSearch(this.value.trim());
  }
});
  $("homeSync").addEventListener("click", sync);
  showTab("home"); sync();
}
init();
