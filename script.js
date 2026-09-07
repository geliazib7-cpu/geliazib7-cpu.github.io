// ---------- Estado de la app ----------
var pages = [];       // URLs (object URLs) de las imágenes cargadas
var currentPage = 0;  // índice de la página actual
var pageTexts = {};   // texto de diálogo guardado por número de página

// ---------- Elementos ----------
var imgEl = document.getElementById('page-image');
var counterEl = document.getElementById('page-counter');
var chapterNameEl = document.getElementById('chapter-name');
var textArea = document.getElementById('page-text');
var fileInput = document.getElementById('file-input');
var speedRange = document.getElementById('speed-range');

// ---------- Cargar imágenes ----------
document.getElementById('btn-load').addEventListener('click', function () {
  fileInput.click();
});

fileInput.addEventListener('change', function (e) {
  var files = Array.prototype.slice.call(e.target.files);
  if (files.length === 0) return;

  pages = files.map(function (file) {
    return URL.createObjectURL(file);
  });
  pageTexts = {};
  currentPage = 0;
  chapterNameEl.textContent = files.length + ' páginas cargadas';
  showPage(currentPage);
});

// ---------- Mostrar página ----------
function showPage(index) {
  if (pages.length === 0) return;
  if (index < 0) index = 0;
  if (index > pages.length - 1) index = pages.length - 1;

  currentPage = index;
  imgEl.src = pages[currentPage];
  counterEl.textContent = (currentPage + 1) + ' / ' + pages.length;

  // Recupera el texto guardado de esta página (si existe)
  textArea.value = pageTexts[currentPage] || '';

  stopSpeech();
}

// Guarda el texto escrito antes de cambiar de página
function saveCurrentText() {
  pageTexts[currentPage] = textArea.value;
}

// ---------- Navegación ----------
document.getElementById('btn-prev').addEventListener('click', function () {
  saveCurrentText();
  showPage(currentPage - 1);
});

document.getElementById('btn-next').addEventListener('click', function () {
  saveCurrentText();
  showPage(currentPage + 1);
});

// ---------- Lectura en voz alta (Web Speech API) ----------
var synth = window.speechSynthesis;
var utterance = null;

function speakText() {
  var text = textArea.value.trim();
  if (!text) return;

  stopSpeech(); // por si había algo sonando

  utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'es-ES';
  utterance.rate = parseFloat(speedRange.value);
  synth.speak(utterance);
}

function pauseOrResume() {
  if (synth.speaking && !synth.paused) {
    synth.pause();
  } else if (synth.paused) {
    synth.resume();
  }
}

function stopSpeech() {
  if (synth.speaking || synth.paused) {
    synth.cancel();
  }
}

document.getElementById('btn-play').addEventListener('click', speakText);
document.getElementById('btn-pause').addEventListener('click', pauseOrResume);
document.getElementById('btn-stop').addEventListener('click', stopSpeech);

// ---------- Aviso si el navegador no soporta TTS ----------
if (!('speechSynthesis' in window)) {
  chapterNameEl.textContent = 'Este navegador no soporta lectura en voz alta';
}
