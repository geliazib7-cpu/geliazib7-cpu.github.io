// ============ Base de datos local (IndexedDB) ============
var db = null;
var dbReady = false;
var dbSupported = ('indexedDB' in window);

function openDB(callback) {
  if (!dbSupported) { callback(false); return; }
  var req = indexedDB.open('mangaLibraryDB', 1);

  req.onupgradeneeded = function (e) {
    var d = e.target.result;
    if (!d.objectStoreNames.contains('series')) {
      d.createObjectStore('series', { keyPath: 'id' });
    }
    if (!d.objectStoreNames.contains('chapters')) {
      d.createObjectStore('chapters', { keyPath: 'key' });
    }
    if (!d.objectStoreNames.contains('covers')) {
      d.createObjectStore('covers', { keyPath: 'id' });
    }
  };

  req.onsuccess = function (e) {
    db = e.target.result;
    dbReady = true;
    callback(true);
  };

  req.onerror = function () {
    dbReady = false;
    callback(false);
  };
}

function slugify(text) {
  return text.toLowerCase()
    .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u').replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// ============ Estado ============
var pages = [];
var currentPage = 0;
var currentSeries = null;
var currentChapterName = null;
var currentSeriesChapters = [];

// ============ Elementos ============
var topTitleEl = document.getElementById('top-title');
var counterEl = document.getElementById('page-counter');
var btnBack = document.getElementById('btn-back');
var btnAddSeries = document.getElementById('btn-add-series');
var btnAddChapters = document.getElementById('btn-add-chapters');

var libraryView = document.getElementById('library-view');
var chaptersView = document.getElementById('chapters-view');
var viewerView = document.getElementById('viewer-view');
var unsupportedMsg = document.getElementById('unsupported-msg');

var libraryGridEl = document.getElementById('library-grid');
var continueBoxEl = document.getElementById('continue-box');
var chapterListEl = document.getElementById('chapter-list');

var imgEl = document.getElementById('page-image');
var viewerMessageEl = document.getElementById('viewer-message');

var addSeriesForm = document.getElementById('add-series-form');
var addChaptersForm = document.getElementById('add-chapters-form');

// ============ Progreso (localStorage, ya funcionaba bien) ============
function getProgressStore() {
  try { return JSON.parse(localStorage.getItem('manga_progress') || '{}'); }
  catch (e) { return {}; }
}
function saveProgressStore(obj) {
  try { localStorage.setItem('manga_progress', JSON.stringify(obj)); }
  catch (e) {}
}
function saveProgress(series, chapterName, page, total) {
  var store = getProgressStore();
  if (!store[series]) store[series] = {};
  store[series].lastChapter = chapterName;
  store[series].chapters = store[series].chapters || {};
  store[series].chapters[chapterName] = { page: page, total: total };
  saveProgressStore(store);
}
function getSeriesProgress(series) {
  var store = getProgressStore();
  return store[series] || null;
}

// ============ Orden natural ============
function naturalCompare(a, b) {
  var ax = [], bx = [];
  a.replace(/(\d+)|(\D+)/g, function (_, d, s) { ax.push([d || Infinity, s || '']); });
  b.replace(/(\d+)|(\D+)/g, function (_, d, s) { bx.push([d || Infinity, s || '']); });
  while (ax.length && bx.length) {
    var an = ax.shift(), bn = bx.shift();
    var nn = (an[0] - bn[0]) || an[1].localeCompare(bn[1]);
    if (nn) return nn;
  }
  return ax.length - bx.length;
}

// ============ Vistas ============
function showView(name) {
  libraryView.classList.add('hidden');
  chaptersView.classList.add('hidden');
  viewerView.classList.add('hidden');
  counterEl.textContent = '';
  btnBack.classList.toggle('hidden', name === 'library');
  btnAddSeries.classList.toggle('hidden', name !== 'library');
  btnAddChapters.classList.toggle('hidden', name !== 'chapters');

  if (name === 'library') {
    libraryView.classList.remove('hidden');
    topTitleEl.textContent = 'Mi biblioteca';
    loadLibrary();
  } else if (name === 'chapters') {
    chaptersView.classList.remove('hidden');
    topTitleEl.textContent = currentSeries ? currentSeries.title : '';
  } else if (name === 'viewer') {
    viewerView.classList.remove('hidden');
    topTitleEl.textContent = currentChapterName || '';
  }
}

btnBack.addEventListener('click', function () {
  if (!viewerView.classList.contains('hidden')) {
    openSeries(currentSeries.id);
  } else {
    showView('library');
  }
});

// ============ Biblioteca ============
function loadLibrary() {
  if (!dbSupported) {
    unsupportedMsg.classList.remove('hidden');
    unsupportedMsg.textContent = 'Este navegador no soporta almacenamiento local (IndexedDB), así que no se pueden guardar mangas de forma permanente.';
    libraryGridEl.innerHTML = '';
    return;
  }

  var tx = db.transaction(['series'], 'readonly');
  var store = tx.objectStore('series');
  var all = [];

  store.openCursor().onsuccess = function (e) {
    var cursor = e.target.result;
    if (cursor) {
      all.push(cursor.value);
      cursor.continue();
    } else {
      renderLibrary(all);
    }
  };
}

function renderLibrary(seriesList) {
  seriesList.sort(function (a, b) { return a.title.localeCompare(b.title); });

  if (seriesList.length === 0) {
    libraryGridEl.innerHTML = '<div class="empty-msg">Todavía no has agregado ningún manga.<br>Toca "+ Manga" arriba para empezar.</div>';
    return;
  }

  libraryGridEl.innerHTML = '';
  seriesList.forEach(function (s) {
    var progress = getSeriesProgress(s.id);

    var card = document.createElement('div');
    card.className = 'series-card';

    var coverBox = document.createElement('div');
    coverBox.className = 'series-cover';

    var covTx = db.transaction(['covers'], 'readonly');
    covTx.objectStore('covers').get(s.id).onsuccess = function (e) {
      if (e.target.result && e.target.result.blob) {
        var img = document.createElement('img');
        img.src = URL.createObjectURL(e.target.result.blob);
        coverBox.appendChild(img);
      } else {
        coverBox.innerHTML = '<span class="cover-fallback">' + s.title.charAt(0).toUpperCase() + '</span>';
      }
    };

    var titleEl = document.createElement('div');
    titleEl.className = 'series-title';
    titleEl.textContent = s.title;

    var progEl = document.createElement('div');
    progEl.className = 'series-progress';
    progEl.textContent = progress ? ('Vas en: ' + progress.lastChapter) : (s.chapterNames.length + ' capítulos');

    card.appendChild(coverBox);
    card.appendChild(titleEl);
    card.appendChild(progEl);
    card.addEventListener('click', function () { openSeries(s.id); });

    libraryGridEl.appendChild(card);
  });
}

// ============ Abrir serie ============
function openSeries(seriesId) {
  var tx = db.transaction(['series'], 'readonly');
  tx.objectStore('series').get(seriesId).onsuccess = function (e) {
    var s = e.target.result;
    if (!s) { showView('library'); return; }
    currentSeries = s;
    currentSeriesChapters = s.chapterNames.slice().sort(naturalCompare);
    showView('chapters');
    renderChapterList();
  };
}

function renderChapterList() {
  continueBoxEl.classList.add('hidden');

  if (currentSeriesChapters.length === 0) {
    chapterListEl.innerHTML = '<div class="empty-msg">Sin capítulos todavía. Toca "+ Capítulos" arriba.</div>';
    return;
  }

  var progress = getSeriesProgress(currentSeries.id);

  if (progress && progress.lastChapter && progress.chapters && progress.chapters[progress.lastChapter]) {
    var last = progress.chapters[progress.lastChapter];
    continueBoxEl.innerHTML =
      '<div class="continue-label">Continuar leyendo</div>' +
      '<div class="continue-title">' + progress.lastChapter + ' — página ' + (last.page + 1) + ' de ' + last.total + '</div>';
    continueBoxEl.classList.remove('hidden');
    continueBoxEl.onclick = function () { loadChapter(progress.lastChapter, last.page); };
  }

  chapterListEl.innerHTML = '';
  currentSeriesChapters.forEach(function (chapterName) {
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

    btn.addEventListener('click', function () { loadChapter(chapterName, 0); });
    chapterListEl.appendChild(btn);
  });
}

// ============ Leer un capítulo (desde IndexedDB, sin internet) ============
function loadChapter(chapterName, startPage) {
  pages = [];
  currentPage = 0;
  currentChapterName = chapterName;
  showView('viewer');
  viewerMessageEl.textContent = 'Abriendo capítulo...';
  viewerMessageEl.style.display = 'block';
  imgEl.src = '';

  var key = currentSeries.id + '::' + chapterName;
  var tx = db.transaction(['chapters'], 'readonly');
  tx.objectStore('chapters').get(key).onsuccess = function (e) {
    var record = e.target.result;
    if (!record) {
      viewerMessageEl.textContent = 'No se encontró el capítulo guardado.';
      return;
    }
    try {
      var zip = new JSZip(record.data);
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

      pages = imageNames.map(function (name) {
        var fileData = zip.files[name].asArrayBuffer();
        var ext = name.split('.').pop().toLowerCase();
        var mime = (ext === 'png') ? 'image/png' : (ext === 'webp') ? 'image/webp' : (ext === 'gif') ? 'image/gif' : 'image/jpeg';
        return URL.createObjectURL(new Blob([fileData], { type: mime }));
      });

      viewerMessageEl.style.display = 'none';
      showPage(startPage || 0);
    } catch (err) {
      viewerMessageEl.textContent = 'No se pudo abrir el .cbz: ' + err.message;
    }
  };
}

function showPage(index) {
  if (pages.length === 0) return;
  if (index < 0) index = 0;
  if (index > pages.length - 1) index = pages.length - 1;
  currentPage = index;
  imgEl.src = pages[currentPage];
  counterEl.textContent = (currentPage + 1) + ' / ' + pages.length;
  saveProgress(currentSeries.id, currentChapterName, currentPage, pages.length);
}

document.getElementById('btn-prev').addEventListener('click', function () { showPage(currentPage - 1); });
document.getElementById('btn-next').addEventListener('click', function () { showPage(currentPage + 1); });

// ============ Agregar manga nuevo ============
btnAddSeries.addEventListener('click', function () {
  document.getElementById('input-series-title').value = '';
  document.getElementById('input-cover').value = '';
  document.getElementById('input-chapters').value = '';
  document.getElementById('add-series-status').textContent = '';
  addSeriesForm.classList.remove('hidden');
});

document.getElementById('btn-cancel-series').addEventListener('click', function () {
  addSeriesForm.classList.add('hidden');
});

document.getElementById('btn-save-series').addEventListener('click', function () {
  var title = document.getElementById('input-series-title').value.trim();
  var coverFile = document.getElementById('input-cover').files[0];
  var chapterFiles = document.getElementById('input-chapters').files;
  var statusEl = document.getElementById('add-series-status');

  if (!title) { statusEl.textContent = 'Escribe un nombre para el manga.'; return; }
  if (chapterFiles.length === 0) { statusEl.textContent = 'Elige al menos un capítulo .cbz.'; return; }

  var seriesId = slugify(title);
  statusEl.textContent = 'Guardando...';

  var chapterNames = [];
  var pending = chapterFiles.length;

  function afterAllChapters() {
    var seriesRecord = { id: seriesId, title: title, chapterNames: chapterNames };
    var tx = db.transaction(['series'], 'readwrite');
    tx.objectStore('series').put(seriesRecord);
    tx.oncomplete = function () {
      function done() {
        statusEl.textContent = '¡Listo!';
        addSeriesForm.classList.add('hidden');
        showView('library');
      }
      if (coverFile) {
        var reader = new FileReader();
        reader.onload = function () {
          var covTx = db.transaction(['covers'], 'readwrite');
          covTx.objectStore('covers').put({ id: seriesId, blob: new Blob([reader.result], { type: coverFile.type }) });
          covTx.oncomplete = done;
        };
        reader.readAsArrayBuffer(coverFile);
      } else {
        done();
      }
    };
  }

  for (var i = 0; i < chapterFiles.length; i++) {
    (function (file) {
      var reader = new FileReader();
      reader.onload = function () {
        var key = seriesId + '::' + file.name.replace(/\.cbz$/i, '');
        var tx = db.transaction(['chapters'], 'readwrite');
        tx.objectStore('chapters').put({ key: key, data: reader.result });
        tx.oncomplete = function () {
          chapterNames.push(file.name.replace(/\.cbz$/i, ''));
          pending--;
          statusEl.textContent = 'Guardando... (' + (chapterFiles.length - pending) + '/' + chapterFiles.length + ')';
          if (pending === 0) afterAllChapters();
        };
      };
      reader.readAsArrayBuffer(file);
    })(chapterFiles[i]);
  }
});

// ============ Agregar capítulos a una serie existente ============
btnAddChapters.addEventListener('click', function () {
  document.getElementById('input-more-chapters').value = '';
  document.getElementById('add-chapters-status').textContent = '';
  addChaptersForm.classList.remove('hidden');
});

document.getElementById('btn-cancel-chapters').addEventListener('click', function () {
  addChaptersForm.classList.add('hidden');
});

document.getElementById('btn-save-chapters').addEventListener('click', function () {
  var chapterFiles = document.getElementById('input-more-chapters').files;
  var statusEl = document.getElementById('add-chapters-status');

  if (chapterFiles.length === 0) { statusEl.textContent = 'Elige al menos un capítulo .cbz.'; return; }

  statusEl.textContent = 'Guardando...';
  var pending = chapterFiles.length;
  var newNames = [];

  for (var i = 0; i < chapterFiles.length; i++) {
    (function (file) {
      var reader = new FileReader();
      reader.onload = function () {
        var chapterName = file.name.replace(/\.cbz$/i, '');
        var key = currentSeries.id + '::' + chapterName;
        var tx = db.transaction(['chapters'], 'readwrite');
        tx.objectStore('chapters').put({ key: key, data: reader.result });
        tx.oncomplete = function () {
          newNames.push(chapterName);
          pending--;
          statusEl.textContent = 'Guardando... (' + (chapterFiles.length - pending) + '/' + chapterFiles.length + ')';
          if (pending === 0) finishAddChapters(newNames);
        };
      };
      reader.readAsArrayBuffer(file);
    })(chapterFiles[i]);
  }
});

function finishAddChapters(newNames) {
  currentSeries.chapterNames = currentSeries.chapterNames.concat(newNames);
  var tx = db.transaction(['series'], 'readwrite');
  tx.objectStore('series').put(currentSeries);
  tx.oncomplete = function () {
    addChaptersForm.classList.add('hidden');
    openSeries(currentSeries.id);
  };
}

// ============ Arranque ============
openDB(function (ok) {
  dbSupported = ok;
  showView('library');
});
