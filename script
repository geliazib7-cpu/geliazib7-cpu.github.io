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
