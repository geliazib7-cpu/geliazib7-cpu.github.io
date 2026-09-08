// ---------- Configuración del repositorio ----------
var CONFIG = {
  owner: 'geliazib7-cpu',
  repo: 'geliazib7-cpu.github.io',
  branch: 'main',
  rootPath: 'manga' // carpeta raíz: manga/<serie>/cover.jpg + manga/<serie>/*.cbz
};

// ---------- Estado ----------
var pages = [];
var currentPage = 0;
var currentSeries = null;
var currentSeriesTitle = null;
var currentChapterName = null;

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

// ---------- Progreso guardado (localStorage) ----------
function getProgressStore() {
  try {
    return JSON.parse(localStorage.getItem('manga_progress') || '{}');
  } catch (e) {
    return {};
  }
}

function saveProgressStore(obj) {
  try {
    localStorage.setItem('manga_progress', JSON.stringify(obj));
  } catch (e) { /* almacenamiento no disponible, ignorar */ }
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

// ---------- Orden natural (Capítulo 2 antes que Capítulo 10) ----------
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
  libraryView.classList.add('hidden');
  chaptersView.classList.add('hidden');
  viewerView.classList.add('hidden');
  counterEl.textContent = '';
  btnBack.classList.toggle('hidden', name === 'library');

  if (name === 'library') {
    libraryView.classList.remove('hidden');
    topTitleEl.textContent = 'Mi biblioteca';
  } else if (name === 'chapters') {
    chaptersView.classList.remove('hidden');
    topTitleEl.textContent = currentSeriesTitle || currentSeries;
  } else if (name === 'viewer') {
    viewerView.classList.remove('hidden');
    topTitleEl.textContent = currentChapterName || '';
  }
}

btnBack.addEventListener('click', function () {
  if (!viewerView.classList.contains('hidden')) {
    showView('chapters');
  } else {
    showView('library');
  }
});

// ---------- Utilidad para pedir JSON a la API de GitHub ----------
function githubApiGet(path, callback) {
  var url = 'https://api.github.com/repos/' + CONFIG.owner + '/' + CONFIG.repo + '/contents/' + path;
  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.onreadystatechange = function () {
    if (xhr.readyState !== 4) return;
    if (xhr.status !== 200) {
      callback(null, xhr.status);
      return;
    }
    try {
      callback(JSON.parse(xhr.responseText), null);
    } catch (e) {
      callback(null, 'parse');
    }
  };
  xhr.send();
}

function rawUrl(path) {
  return 'https://raw.githubusercontent.com/' + CONFIG.owner + '/' + CONFIG.repo + '/' + CONFIG.branch + '/' + path;
}

// ---------- Cargar biblioteca (lista de series) ----------
function loadLibrary() {
  showView('library');
  libraryGridEl.innerHTML = 'Cargando biblioteca...';

  githubApiGet(CONFIG.rootPath, function (items, err) {
    if (err) {
      libraryGridEl.innerHTML = 'No se pudo cargar la biblioteca (error ' + err + '). Revisa que exista la carpeta "' + CONFIG.rootPath + '" en el repositorio.';
      return;
    }

    var series = items.filter(function (it) { return it.type === 'dir'; });
    series.sort(function (a, b) { return naturalCompare(a.name, b.name); });

    if (series.length === 0) {
      libraryGridEl.innerHTML = 'Todavía no hay ninguna carpeta de manga dentro de "' + CONFIG.rootPath + '".';
      return;
    }

    libraryGridEl.innerHTML = '';
    series.forEach(function (s) {
      var progress = getSeriesProgress(s.name);

      var card = document.createElement('div');
      card.className = 'series-card';

      var coverBox = document.createElement('div');
      coverBox.className = 'series-cover';
      var img = document.createElement('img');
      img.src = rawUrl(CONFIG.rootPath + '/' + s.name + '/cover.jpg');
      img.onerror = function () {
        coverBox.innerHTML = '<span class="cover-fallback">' + s.name.charAt(0).toUpperCase() + '</span>';
      };
      coverBox.appendChild(img);

      var titleEl = document.createElement('div');
      titleEl.className = 'series-title';
      titleEl.textContent = s.name.replace(/[-_]/g, ' ');

      var progEl = document.createElement('div');
      progEl.className = 'series-progress';
      progEl.textContent = progress ? ('Vas en: ' + progress.lastChapter) : 'Nuevo';

      card.appendChild(coverBox);
      card.appendChild(titleEl);
      card.appendChild(progEl);

      card.addEventListener('click', function () {
        openSeries(s.name, titleEl.textContent);
      });

      libraryGridEl.appendChild(card);
    });
  });
}

// ---------- Abrir una serie: mostrar lista de capítulos ----------
function openSeries(seriesName, seriesTitle) {
  currentSeries = seriesName;
  currentSeriesTitle = seriesTitle;
  showView('chapters');
  chapterListEl.innerHTML = 'Cargando capítulos...';
  continueBoxEl.classList.add('hidden');

  githubApiGet(CONFIG.rootPath + '/' + seriesName, function (items, err) {
    if (err) {
      chapterListEl.innerHTML = 'No se pudo cargar la lista (error ' + err + ').';
      return;
    }

    var files = items.filter(function (f) { return f.type === 'file' && /\.cbz$/i.test(f.name); });
    files.sort(function (a, b) { return naturalCompare(a.name, b.name); });

    if (files.length === 0) {
      chapterListEl.innerHTML = 'No hay archivos .cbz todavía en esta carpeta.';
      return;
    }

    var progress = getSeriesProgress(seriesName);

    if (progress && progress.lastChapter && progress.chapters && progress.chapters[progress.lastChapter]) {
      var last = progress.chapters[progress.lastChapter];
      continueBoxEl.innerHTML =
        '<div class="continue-label">Continuar leyendo</div>' +
        '<div class="continue-title">' + progress.lastChapter + ' — página ' + (last.page + 1) + ' de ' + last.total + '</div>';
      continueBoxEl.classList.remove('hidden');
      continueBoxEl.onclick = function () {
        var match = files.filter(function (f) { return f.name.replace(/\.cbz$/i, '') === progress.lastChapter; })[0];
        if (match) loadChapter(match.download_url, match.name.replace(/\.cbz$/i, ''), last.page);
      };
    }

    chapterListEl.innerHTML = '';
    files.forEach(function (f) {
      var chapterName = f.name.replace(/\.cbz$/i, '');
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

      btn.addEventListener('click', function () {
        loadChapter(f.download_url, chapterName, 0);
      });
      chapterListEl.appendChild(btn);
    });
  });
}

// ---------- Descargar y desempaquetar un capítulo .cbz ----------
function loadChapter(fileUrl, chapterName, startPage) {
  pages = [];
  currentPage = 0;
  currentChapterName = chapterName;
  showView('viewer');
  viewerMessageEl.textContent = 'Descargando capítulo, espera un momento...';
  viewerMessageEl.style.display = 'block';
  imgEl.src = '';
  counterEl.textContent = '';

  var xhr = new XMLHttpRequest();
  xhr.open('GET', fileUrl, true);
  xhr.responseType = 'arraybuffer';

  xhr.onreadystatechange = function () {
    if (xhr.readyState !== 4) return;

    if (xhr.status !== 200) {
      viewerMessageEl.textContent = 'Error descargando el capítulo (código ' + xhr.status + ').';
      return;
    }

    try {
      var zip = new JSZip(xhr.response);
      var imageNames = [];
      for (var filename in zip.files) {
        if (!zip.files[filename].dir && /\.(jpe?g|png|webp|gif)$/i.test(filename)) {
          imageNames.push(filename);
        }
      }
      imageNames.sort(naturalCompare);

      if (imageNames.length === 0) {
        viewerMessageEl.textContent = 'El .cbz no contiene imágenes reconocibles.';
        return;
      }

      pages = imageNames.map(function (filename) {
        var data = zip.files[filename].asArrayBuffer();
        var ext = filename.split('.').pop().toLowerCase();
        var mime = (ext === 'png') ? 'image/png' : (ext === 'webp') ? 'image/webp' : (ext === 'gif') ? 'image/gif' : 'image/jpeg';
        var blob = new Blob([data], { type: mime });
        return URL.createObjectURL(blob);
      });

      viewerMessageEl.style.display = 'none';
      showPage(startPage || 0);

    } catch (e) {
      viewerMessageEl.textContent = 'No se pudo abrir el archivo .cbz: ' + e.message;
    }
  };

  xhr.send();
}

// ---------- Mostrar página (y guardar progreso) ----------
function showPage(index) {
  if (pages.length === 0) return;
  if (index < 0) index = 0;
  if (index > pages.length - 1) index = pages.length - 1;

  currentPage = index;
  imgEl.src = pages[currentPage];
  counterEl.textContent = (currentPage + 1) + ' / ' + pages.length;

  saveProgress(currentSeries, currentChapterName, currentPage, pages.length);
}

// ---------- Navegación de páginas ----------
document.getElementById('btn-prev').addEventListener('click', function () {
  showPage(currentPage - 1);
});

document.getElementById('btn-next').addEventListener('click', function () {
  showPage(currentPage + 1);
});

// ---------- Arranque ----------
loadLibrary();
