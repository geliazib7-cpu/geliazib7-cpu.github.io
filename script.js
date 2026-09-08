// ---------- Configuración ----------
var CONFIG = {
  rootPath: 'manga',
  manifestFile: 'library.json'
};

// ---------- Estado ----------
var pages = [];
var currentPage = 0;
var currentSeries = null;
var currentSeriesTitle = null;
var currentChapterName = null;
var currentSeriesChapters = [];
var pageBlobs = [];

// ---------- Detección de características ----------
var hasBlob = (function() {
  try { return !!window.Blob; } catch(e) { return false; }
})();

var hasCreateObjectURL = (function() {
  try {
    return !!(window.URL && window.URL.createObjectURL) || !!(window.webkitURL && window.webkitURL.createObjectURL);
  } catch(e) { return false; }
})();

var useDataURLs = !hasCreateObjectURL;

// ---------- Elementos ----------
var topTitleEl = document.getElementById('top-title');
var counterEl = document.getElementById('page-counter');
var btnBack = document.getElementById('btn-back');
var libraryView = document.getElementById('library-view');
var chaptersView = document.getElementById('chapters-view');
var viewerView = document.getElementById('viewer-view');
var libraryGridEl = document.getElementById('library-grid');
var continueBoxEl = document.getElementById('continue-box');
var chapterListEl = document.getElementById('chapter-list');
var imgEl = document.getElementById('page-image');
var viewerMessageEl = document.getElementById('viewer-message');

// ---------- Progreso guardado ----------
function getProgressStore() {
  try { return JSON.parse(localStorage.getItem('manga_progress') || '{}'); } catch (e) { return {}; }
}

function saveProgressStore(obj) {
  try { localStorage.setItem('manga_progress', JSON.stringify(obj)); } catch (e) { }
}

function saveProgress(series, chapterName, page, total) {
  var store = getProgressStore();
  if (!store[series]) store[series] = {};
  store[series].lastChapter = chapterName;
  store[series].chapters = store[series].chapters || {};
  store[series].chapters[chapterName] = { page: page, total: total, updated: Date.now() };
  saveProgressStore(store);
}

function getSeriesProgress(series) {
  var store = getProgressStore();
  return store[series] || null;
}

// ---------- Orden natural ----------
function naturalCompare(a, b) {
  var ax = [], bx = [];
  a.replace(/(\d+)|(\D+)/g, function (_, d, s) { ax.push([d || Infinity, s || '']); });
  b.replace(/(\d+)|(\D+)/g, function (_, d, s) { bx.push([d || Infinity, s || '']); });
  while (ax.length && bx.length) {
    var an = ax.shift();
    var bn = bx.shift();
    var nn = (an[0] - bn[0]) || an[1].localeCompare(bn[1]);
    if (nn) return nn;
  }
  return ax.length - bx.length;
}

// ---------- Navegación entre vistas ----------
function showView(name) {
  libraryView.className = 'view hidden';
  chaptersView.className = 'view hidden';
  viewerView.className = 'view hidden';
  counterEl.textContent = '';
  
  if (name === 'library') {
    btnBack.className = 'hidden';
    libraryView.className = 'view';
    topTitleEl.textContent = 'Mi biblioteca';
  } else if (name === 'chapters') {
    btnBack.className = '';
    chaptersView.className = 'view';
    topTitleEl.textContent = currentSeriesTitle || currentSeries;
  } else if (name === 'viewer') {
    btnBack.className = '';
    viewerView.className = 'view';
    topTitleEl.textContent = currentChapterName || '';
  }
}

btnBack.addEventListener('click', function () {
  if (viewerView.className.indexOf('hidden') === -1) {
    showView('chapters');
  } else {
    showView('library');
  }
});

// ---------- Utilidad: pedir archivo ----------
function sameOriginGet(path, responseType, callback) {
  var xhr = new XMLHttpRequest();
  var done = false;

  var timeoutId = setTimeout(function () {
    if (done) return;
    done = true;
    try { xhr.abort(); } catch (e2) {}
    callback(null, 'timeout');
  }, 30000);

  function finish(result, err) {
    if (done) return;
    done = true;
    clearTimeout(timeoutId);
    callback(result, err);
  }

  try {
    xhr.open('GET', path + '?t=' + Date.now(), true);
    if (responseType) xhr.responseType = responseType;
  } catch (e0) {
    finish(null, 'open-failed');
    return;
  }

  xhr.onreadystatechange = function () {
    if (xhr.readyState !== 4) return;
    if (xhr.status !== 200 && xhr.status !== 0) {
      finish(null, xhr.status);
      return;
    }
    finish(responseType === 'arraybuffer' ? xhr.response : xhr.responseText, null);
  };

  xhr.onerror = function () { finish(null, 'error-de-red'); };

  try { xhr.send(); } catch (e1) { finish(null, 'send-failed'); }
}

// ---------- Cargar biblioteca ----------
function loadLibrary() {
  showView('library');
  libraryGridEl.innerHTML = 'Cargando biblioteca...';

  sameOriginGet(CONFIG.manifestFile, 'text', function (text, err) {
    if (err) {
      libraryGridEl.innerHTML = 'No se pudo leer "' + CONFIG.manifestFile + '" (error ' + err + ').';
      return;
    }

    var series;
    try { series = JSON.parse(text); } catch (e) {
      libraryGridEl.innerHTML = 'El archivo library.json tiene un error de formato.';
      return;
    }

    if (!series || series.length === 0) {
      libraryGridEl.innerHTML = 'Todavía no hay ningún manga en library.json.';
      return;
    }

    libraryGridEl.innerHTML = '';
    for (var i = 0; i < series.length; i++) {
      (function(s) {
        var progress = getSeriesProgress(s.name);
        var card = document.createElement('div');
        card.className = 'series-card';

        var coverBox = document.createElement('div');
        coverBox.className = 'series-cover';
        var img = document.createElement('img');
        img.src = CONFIG.rootPath + '/' + s.name + '/cover.jpg';
        img.onerror = function () {
          coverBox.innerHTML = '<span class="cover-fallback">' + (s.title || s.name).charAt(0).toUpperCase() + '</span>';
        };
        coverBox.appendChild(img);

        var titleEl = document.createElement('div');
        titleEl.className = 'series-title';
        titleEl.textContent = s.title || s.name;

        var progEl = document.createElement('div');
        progEl.className = 'series-progress';
        progEl.textContent = progress ? ('Vas en: ' + progress.lastChapter) : 'Nuevo';

        card.appendChild(coverBox);
        card.appendChild(titleEl);
        card.appendChild(progEl);

        card.addEventListener('click', function () { openSeries(s); });
        libraryGridEl.appendChild(card);
      })(series[i]);
    }
  });
}

// ---------- Abrir serie ----------
function openSeries(seriesObj) {
  currentSeries = seriesObj.name;
  currentSeriesTitle = seriesObj.title || seriesObj.name;
  currentSeriesChapters = (seriesObj.chapters || []).slice().sort(naturalCompare);

  showView('chapters');
  continueBoxEl.className = 'hidden';

  if (currentSeriesChapters.length === 0) {
    chapterListEl.innerHTML = 'No hay capítulos listados para esta serie.';
    return;
  }

  var progress = getSeriesProgress(currentSeries);

  if (progress && progress.lastChapter && progress.chapters && progress.chapters[progress.lastChapter]) {
    var last = progress.chapters[progress.lastChapter];
    continueBoxEl.innerHTML =
      '<div class="continue-label">Continuar leyendo</div>' +
      '<div class="continue-title">' + progress.lastChapter + ' — página ' + (last.page + 1) + ' de ' + last.total + '</div>';
    continueBoxEl.className = '';
    continueBoxEl.onclick = function () {
      var match = null;
      for (var i = 0; i < currentSeriesChapters.length; i++) {
        if (currentSeriesChapters[i].replace(/\.cbz$/i, '') === progress.lastChapter) {
          match = currentSeriesChapters[i];
          break;
        }
      }
      if (match) loadChapter(match, last.page);
    };
  }

  chapterListEl.innerHTML = '';
  for (var j = 0; j < currentSeriesChapters.length; j++) {
    (function(filename) {
      var chapterName = filename.replace(/\.cbz$/i, '');
      var btn = document.createElement('button');
      btn.className = 'chapter-item';

      var label = document.createElement('span');
      label.textContent = chapterName;
      btn.appendChild(label);

      if (progress && progress.chapters && progress.chapters[chapterName]) {
        var cp = progress.chapters[chapterName];
        var tag = document.createElement('span');
        tag.className = 'chapter-progress-tag';
        tag.textContent = (cp.page + 1 >= cp.total) ? 'Terminado' : ('Página ' + (cp.page + 1) + ' de ' + cp.total);
        btn.appendChild(tag);
      }

      btn.addEventListener('click', function () { loadChapter(filename, 0); });
      chapterListEl.appendChild(btn);
    })(currentSeriesChapters[j]);
  }
}

// ---------- Liberar memoria ----------
function cleanupPages() {
  if (!useDataURLs && window.webkitURL) {
    for (var i = 0; i < pageBlobs.length; i++) {
      try { window.webkitURL.revokeObjectURL(pageBlobs[i]); } catch(e) {}
    }
  }
  pageBlobs = [];
  pages = [];
}

// ---------- Cargar capítulo ----------
function loadChapter(filename, startPage) {
  var chapterName = filename.replace(/\.cbz$/i, '');
  var path = CONFIG.rootPath + '/' + currentSeries + '/' + filename;

  cleanupPages();
  currentPage = 0;
  currentChapterName = chapterName;
  showView('viewer');
  viewerMessageEl.style.display = 'block';
  viewerMessageEl.textContent = 'Descargando capítulo, espera un momento...';
  imgEl.src = '';
  counterEl.textContent = '';

  sameOriginGet(path, 'arraybuffer', function (data, err) {
    if (err) {
      viewerMessageEl.textContent = 'Error descargando el capítulo (código ' + err + ').';
      return;
    }

    try {
      var zip = new JSZip(data);
      var imageNames = [];
      for (var name in zip.files) {
        if (!zip.files[name].dir && /\.(jpe?g|png|webp|gif)$/i.test(name)) {
          imageNames.push(name);
        }
      }
      imageNames.sort(naturalCompare);

      if (imageNames.length === 0) {
        viewerMessageEl.textContent = 'El .cbz no contiene imágenes reconocibles.';
        return;
      }

      if (useDataURLs) {
        var processBatch = function(startIdx) {
          var endIdx = Math.min(startIdx + 3, imageNames.length);
          for (var i = startIdx; i < endIdx; i++) {
            (function(idx) {
              try {
                var fileData = zip.files[imageNames[idx]].asArrayBuffer();
                var ext = imageNames[idx].split('.').pop().toLowerCase();
                var mime = 'image/jpeg';
                if (ext === 'png') mime = 'image/png';
                else if (ext === 'webp') mime = 'image/webp';
                else if (ext === 'gif') mime = 'image/gif';
                
                var bytes = new Uint8Array(fileData);
                var binary = '';
                for (var j = 0; j < bytes.length; j++) {
                  binary += String.fromCharCode(bytes[j]);
                }
                pages[idx] = 'data:' + mime + ';base64,' + window.btoa(binary);
              } catch(e) {
                pages[idx] = '';
              }
            })(i);
          }
          
          if (endIdx < imageNames.length) {
            viewerMessageEl.textContent = 'Procesando imágenes... ' + endIdx + '/' + imageNames.length;
            setTimeout(function() { processBatch(endIdx); }, 10);
          } else {
            viewerMessageEl.style.display = 'none';
            showPage(startPage || 0);
          }
        };
        processBatch(0);
      } else {
        for (var k = 0; k < imageNames.length; k++) {
          try {
            var fileData = zip.files[imageNames[k]].asArrayBuffer();
            var ext = imageNames[k].split('.').pop().toLowerCase();
            var mime = 'image/jpeg';
            if (ext === 'png') mime = 'image/png';
            else if (ext === 'webp') mime = 'image/webp';
            else if (ext === 'gif') mime = 'image/gif';
            
            var blob = new Blob([fileData], { type: mime });
            var url = window.URL ? window.URL.createObjectURL(blob) : window.webkitURL.createObjectURL(blob);
            pages.push(url);
            pageBlobs.push(url);
          } catch(e) {
            try {
              var bytes = new Uint8Array(fileData);
              var binary = '';
              for (var m = 0; m < bytes.length; m++) {
                binary += String.fromCharCode(bytes[m]);
              }
              pages.push('data:' + mime + ';base64,' + window.btoa(binary));
            } catch(e2) {
              pages.push('');
            }
          }
        }
        viewerMessageEl.style.display = 'none';
        showPage(startPage || 0);
      }
    } catch (e) {
      viewerMessageEl.textContent = 'No se pudo abrir el archivo .cbz: ' + e.message;
    }
  });
}

// ---------- Mostrar página ----------
function showPage(index) {
  if (pages.length === 0) return;
  if (index < 0) index = 0;
  if (index > pages.length - 1) index = pages.length - 1;

  currentPage = index;
  imgEl.src = pages[currentPage];
  counterEl.textContent = (currentPage + 1) + ' / ' + pages.length;
  saveProgress(currentSeries, currentChapterName, currentPage, pages.length);
}

// ---------- Navegación ----------
document.getElementById('btn-prev').addEventListener('click', function () {
  showPage(currentPage - 1);
});

document.getElementById('btn-next').addEventListener('click', function () {
  showPage(currentPage + 1);
});

// ---------- Arranque ----------
loadLibrary();
    
