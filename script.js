// ---------- Configuración ----------
var CONFIG = {
  rootPath: 'manga',
  manifestFile: 'manga/library.json'
};

// ---------- Estado ----------
var pages = [];
var currentPage = 0;
var currentSeries = null;
var currentSeriesTitle = null;
var currentChapterName = null;
var currentSeriesChapters = []; // lista de nombres de archivo .cbz de la serie abierta

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

// ---------- Utilidad: pedir un archivo del MISMO sitio (sin cruzar dominios) ----------
function sameOriginGet(path, responseType, callback) {
  var xhr = new XMLHttpRequest();
  var done = false;

  var timeoutId = setTimeout(function () {
    if (done) return;
    done = true;
    try { xhr.abort(); } catch (e2) {}
    callback(null, 'timeout');
  }, 15000);

  function finish(result, err) {
    if (done) return;
    done = true;
    clearTimeout(timeoutId);
    callback(result, err);
  }

  try {
    // Se agrega "?t=" para evitar que el navegador use una copia vieja guardada en caché
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

  xhr.onerror = function () {
    finish(null, 'error-de-red');
  };

  try {
    xhr.send();
  } catch (e1) {
    finish(null, 'send-failed');
  }
}

// ---------- Cargar biblioteca desde manga/library.json ----------
function loadLibrary() {
  showView('library');
  libraryGridEl.innerHTML = 'Cargando biblioteca...';

  sameOriginGet(CONFIG.manifestFile, 'text', function (text, err) {
    if (err) {
      libraryGridEl.innerHTML = 'No se pudo leer "' + CONFIG.manifestFile + '" (error ' + err + '). Revisa que el archivo exista y tenga el formato correcto.';
      return;
    }

    var series;
    try {
      series = JSON.parse(text);
    } catch (e) {
      libraryGridEl.innerHTML = 'El archivo library.json tiene un error de formato (JSON inválido).';
      return;
    }

    if (!series || series.length === 0) {
      libraryGridEl.innerHTML = 'Todavía no hay ningún manga en library.json.';
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

      card.addEventListener('click', function () {
        openSeries(s);
      });

      libraryGridEl.appendChild(card);
    });
  });
}

// ---------- Abrir una serie: mostrar lista de capítulos ----------
function openSeries(seriesObj) {
  currentSeries = seriesObj.name;
  currentSeriesTitle = seriesObj.title || seriesObj.name;
  currentSeriesChapters = (seriesObj.chapters || []).slice().sort(naturalCompare);

  showView('chapters');
  continueBoxEl.classList.add('hidden');

  if (currentSeriesChapters.length === 0) {
    chapterListEl.innerHTML = 'No hay capítulos listados para esta serie en library.json.';
    return;
  }

  var progress = getSeriesProgress(currentSeries);

  if (progress && progress.lastChapter && progress.chapters && progress.chapters[progress.lastChapter]) {
    var last = progress.chapters[progress.lastChapter];
    continueBoxEl.innerHTML =
      '<div class="continue-label">Continuar leyendo</div>' +
      '<div class="continue-title">' + progress.lastChapter + ' — página ' + (last.page + 1) + ' de ' + last.total + '</div>';
    continueBoxEl.classList.remove('hidden');
    continueBoxEl.onclick = function () {
      var match = currentSeriesChapters.filter(function (f) { return f.replace(/\.cbz$/i, '') === progress.lastChapter; })[0];
      if (match) loadChapter(match, last.page);
    };
  }

  chapterListEl.innerHTML = '';
  currentSeriesChapters.forEach(function (filename) {
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

    btn.addEventListener('click', function () {
      loadChapter(filename, 0);
    });
    chapterListEl.appendChild(btn);
  });
}

// ---------- Descargar y desempaquetar un capítulo .cbz (mismo sitio) ----------
function loadChapter(filename, startPage) {
  var chapterName = filename.replace(/\.cbz$/i, '');
  var path = CONFIG.rootPath + '/' + currentSeries + '/' + filename;

  pages = [];
  currentPage = 0;
  currentChapterName = chapterName;
  showView('viewer');
  viewerMessageEl.textContent = 'Descargando capítulo, espera un momento...';
  viewerMessageEl.style.display = 'block';
  imgEl.src = '';
  counterEl.textContent = '';

  sameOriginGet(path, 'arraybuffer', function (data, err) {
    if (err) {
      viewerMessageEl.textContent = 'Error descargando el capítulo (código ' + err + '). Revisa que el nombre en library.json sea EXACTO al del archivo subido.';
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

      pages = imageNames.map(function (name) {
        var fileData = zip.files[name].asArrayBuffer();
        var ext = name.split('.').pop().toLowerCase();
        var mime = (ext === 'png') ? 'image/png' : (ext === 'webp') ? 'image/webp' : (ext === 'gif') ? 'image/gif' : 'image/jpeg';
        var blob = new Blob([fileData], { type: mime });
        return URL.createObjectURL(blob);
      });

      viewerMessageEl.style.display = 'none';
      showPage(startPage || 0);

    } catch (e) {
      viewerMessageEl.textContent = 'No se pudo abrir el archivo .cbz: ' + e.message;
    }
  });
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
