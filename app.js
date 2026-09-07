/**
 * ==============================================================================
 * DocuLens — AI Document Analyzer & Visual Study Assistant
 * ==============================================================================
 * Features:
 * - Continuous Multi-Page Vertical Document Scrolling (PDF, DOCX, PPTX, Images)
 * - Resizable Split Panels with mouse drag splitter
 * - Ctrl + Mouse Wheel Zooming in Document Viewport
 * - Light & Dark Mode with instant theme toggle
 * - Freehand visual region marker with bounding-box canvas cropping
 * - Streaming Google Gemini API chat with multimodal context
 * - Interactive Mermaid.js vector diagram rendering
 * - PWA Service Worker & Installability
 * ==============================================================================
 */

// ==============================================================================
// 1. GLOBAL APPLICATION STATE
// ==============================================================================

const state = {
  // Document list: Array<{ id, name, type, file, url, text, pageCount, pagesText }>
  documents: [],
  activeDocId: null,
  currentPage: 1,
  zoom: 1.0,
  viewerWidthPercent: parseFloat(localStorage.getItem('doculens_viewer_width') || '68'),

  // Theme: 'light' | 'dark'
  theme: localStorage.getItem('doculens_theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),

  // Freehand Marker State
  isMarkerMode: false,
  isDrawing: false,
  drawingPageNumber: 1,
  pathPoints: [],
  activeSelection: null, // { docId, docName, pageNumber, dataUrl, bbox, pathPoints }

  // Chat & AI State
  messages: [],
  isStreaming: false,
  simplicityLevel: 'simple', // 'simple' | 'standard' | 'technical'
  apiKey: localStorage.getItem('doculens_api_key') || '',
  model: (function () {
    let saved = localStorage.getItem('doculens_model') || 'gemini-3.6-flash';
    if (!saved || ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-exp', 'gemini-1.5-flash-latest'].includes(saved)) {
      saved = 'gemini-3.6-flash';
      localStorage.setItem('doculens_model', 'gemini-3.6-flash');
    }
    return saved;
  })(),

  // PDF Internal Cache
  currentPdfDoc: null,

  // PWA Prompt
  deferredInstallPrompt: null,
};

// ==============================================================================
// 2. DOM ELEMENTS CACHE
// ==============================================================================

const DOM = {
  // Theme Toggle
  themeToggleBtn: document.getElementById('theme-toggle-btn'),
  themeIconSun: document.getElementById('theme-icon-sun'),
  themeIconMoon: document.getElementById('theme-icon-moon'),

  // Top Navbar & File Tray
  fileTray: document.getElementById('file-tray'),
  globalFileInput: document.getElementById('global-file-input'),
  openSettingsBtn: document.getElementById('open-settings-btn'),
  btnInstallApp: document.getElementById('btn-install-app'),
  apiKeyStatusLabel: document.getElementById('api-key-status-label'),
  currentModelBadge: document.getElementById('current-model-badge'),

  // Resizable Splitter & Panels
  mainSplitContainer: document.getElementById('main-split-container'),
  viewerContainer: document.getElementById('viewer-container'),
  splitResizer: document.getElementById('split-resizer'),
  chatContainer: document.getElementById('chat-container'),

  // Mobile Tabs
  mobileTabViewer: document.getElementById('mobile-tab-viewer'),
  mobileTabChat: document.getElementById('mobile-tab-chat'),

  // Viewer Toolbar
  btnPrevPage: document.getElementById('btn-prev-page'),
  btnNextPage: document.getElementById('btn-next-page'),
  pageCounterLabel: document.getElementById('page-counter-label'),
  btnMarkerToggle: document.getElementById('btn-marker-toggle'),
  markerBtnText: document.getElementById('marker-btn-text'),
  btnClearMark: document.getElementById('btn-clear-mark'),
  btnZoomIn: document.getElementById('btn-zoom-in'),
  btnZoomOut: document.getElementById('btn-zoom-out'),
  zoomLabel: document.getElementById('zoom-label'),

  // Viewer Viewport & Elements
  viewerViewport: document.getElementById('viewer-viewport'),
  emptyStateDropzone: document.getElementById('empty-state-dropzone'),
  continuousPagesContainer: document.getElementById('continuous-pages-container'),

  // Chat Panel
  messagesList: document.getElementById('messages-list'),
  chatForm: document.getElementById('chat-form'),
  chatInput: document.getElementById('chat-input'),
  chatSendBtn: document.getElementById('chat-send-btn'),
  btnClearChat: document.getElementById('btn-clear-chat'),
  activeSelectionChip: document.getElementById('active-selection-chip'),
  chipThumbnail: document.getElementById('chip-thumbnail'),
  chipMeta: document.getElementById('chip-meta'),
  btnDismissChip: document.getElementById('btn-dismiss-chip'),
  quickPromptButtons: document.querySelectorAll('.quick-prompt-btn'),
  simplicityButtons: document.querySelectorAll('.simplicity-btn'),

  // Settings Modal
  settingsModal: document.getElementById('settings-modal'),
  closeSettingsBtn: document.getElementById('close-settings-btn'),
  saveSettingsBtn: document.getElementById('save-settings-btn'),
  apiKeyInput: document.getElementById('api-key-input'),
  modelSelect: document.getElementById('model-select'),

  // Lightbox Modal
  lightboxModal: document.getElementById('lightbox-modal'),
  lightboxTitle: document.getElementById('lightbox-title'),
  lightboxViewport: document.getElementById('lightbox-viewport'),
  lightboxTransformLayer: document.getElementById('lightbox-transform-layer'),
  lightboxZoomLabel: document.getElementById('lightbox-zoom-label'),
  lightboxBtnZoomIn: document.getElementById('lightbox-btn-zoom-in'),
  lightboxBtnZoomOut: document.getElementById('lightbox-btn-zoom-out'),
  lightboxBtnReset: document.getElementById('lightbox-btn-reset'),
  lightboxBtnCopy: document.getElementById('lightbox-btn-copy'),
  lightboxCopyText: document.getElementById('lightbox-copy-text'),
  lightboxBtnClose: document.getElementById('lightbox-btn-close'),
};

// ==============================================================================
// 3. APPLICATION INITIALIZATION
// ==============================================================================

function initApp() {
  applyTheme(state.theme);
  applySavedViewerWidth();
  updateApiKeyStatusBadge();
  renderFileTrayTabs();
  renderActiveDocument();
  setupEventListeners();
  setupSplitResizer();
  setupCtrlWheelZoom();
  setupLightboxEvents();
  registerPwaServiceWorker();

  if (window.lucide) {
    lucide.createIcons();
  }
}

function setupEventListeners() {
  // Theme Toggle Event
  DOM.themeToggleBtn?.addEventListener('click', () => {
    const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
  });

  // PWA Install Event Handler
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredInstallPrompt = e;
    if (DOM.btnInstallApp) {
      DOM.btnInstallApp.classList.remove('hidden');
    }
  });

  DOM.btnInstallApp?.addEventListener('click', async () => {
    if (!state.deferredInstallPrompt) return;
    state.deferredInstallPrompt.prompt();
    const { outcome } = await state.deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') {
      DOM.btnInstallApp.classList.add('hidden');
    }
    state.deferredInstallPrompt = null;
  });

  window.addEventListener('appinstalled', () => {
    DOM.btnInstallApp?.classList.add('hidden');
    state.deferredInstallPrompt = null;
  });

  // Mobile Tab Switching
  DOM.mobileTabViewer?.addEventListener('click', () => switchMobileTab('viewer'));
  DOM.mobileTabChat?.addEventListener('click', () => switchMobileTab('chat'));

  // Settings Modal Triggers
  DOM.openSettingsBtn?.addEventListener('click', openSettingsModal);
  DOM.closeSettingsBtn?.addEventListener('click', closeSettingsModal);
  DOM.saveSettingsBtn?.addEventListener('click', saveSettingsModal);

  // File Upload Handlers
  DOM.emptyStateDropzone?.addEventListener('click', () => DOM.globalFileInput.click());
  DOM.globalFileInput?.addEventListener('change', (e) => handleFileUpload(e.target.files));
  DOM.emptyStateDropzone?.addEventListener('dragover', (e) => e.preventDefault());
  DOM.emptyStateDropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    handleFileUpload(e.dataTransfer.files);
  });

  // Zoom & Page Navigation Controls
  DOM.btnZoomIn?.addEventListener('click', () => updateZoom(state.zoom + 0.15));
  DOM.btnZoomOut?.addEventListener('click', () => updateZoom(state.zoom - 0.15));
  DOM.btnPrevPage?.addEventListener('click', () => scrollToPage(state.currentPage - 1));
  DOM.btnNextPage?.addEventListener('click', () => scrollToPage(state.currentPage + 1));

  // Marker Tool
  DOM.btnMarkerToggle?.addEventListener('click', toggleMarkerMode);
  DOM.btnClearMark?.addEventListener('click', clearActiveSelection);
  DOM.btnDismissChip?.addEventListener('click', clearActiveSelection);

  // Simplicity Level Selectors
  DOM.simplicityButtons.forEach((btn) => {
    btn.addEventListener('click', () => setSimplicityLevel(btn.dataset.level));
  });

  // Quick Starter Prompts
  DOM.quickPromptButtons.forEach((btn) => {
    btn.addEventListener('click', () => submitChatMessage(btn.innerText.trim()));
  });

  // Clear Chat History
  DOM.btnClearChat?.addEventListener('click', resetChatHistory);

  // Chat Submission
  DOM.chatForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = DOM.chatInput.value.trim();
    if (query) {
      DOM.chatInput.value = '';
      submitChatMessage(query);
    }
  });

  DOM.chatInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      DOM.chatForm.dispatchEvent(new Event('submit'));
    }
  });
}

// ==============================================================================
// 4. THEME & DARK MODE MANAGEMENT
// ==============================================================================

function applyTheme(theme) {
  state.theme = theme;
  localStorage.setItem('doculens_theme', theme);

  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
    if (DOM.themeToggleBtn) {
      DOM.themeToggleBtn.innerHTML = '<i data-lucide="sun" class="w-4 h-4 text-amber-400"></i>';
      DOM.themeToggleBtn.setAttribute('title', 'Switch to Light Mode');
    }
  } else {
    document.documentElement.classList.remove('dark');
    if (DOM.themeToggleBtn) {
      DOM.themeToggleBtn.innerHTML = '<i data-lucide="moon" class="w-4 h-4 text-slate-600"></i>';
      DOM.themeToggleBtn.setAttribute('title', 'Switch to Dark Mode');
    }
  }

  if (window.lucide) {
    lucide.createIcons();
  }
}

// ==============================================================================
// 5. RESIZABLE SPLIT PANELS & CTRL + WHEEL ZOOM
// ==============================================================================

function applySavedViewerWidth() {
  if (window.innerWidth >= 768) {
    const percent = Math.min(Math.max(25, state.viewerWidthPercent), 85);
    DOM.viewerContainer.style.width = `${percent}%`;
  }
}

function setupSplitResizer() {
  let isResizing = false;

  DOM.splitResizer?.addEventListener('pointerdown', (e) => {
    isResizing = true;
    DOM.splitResizer.setPointerCapture(e.pointerId);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  window.addEventListener('pointermove', (e) => {
    if (!isResizing) return;
    const containerRect = DOM.mainSplitContainer.getBoundingClientRect();
    const newWidthPx = e.clientX - containerRect.left;
    const percent = Math.min(Math.max(25, (newWidthPx / containerRect.width) * 100), 85);

    state.viewerWidthPercent = percent;
    DOM.viewerContainer.style.width = `${percent}%`;
  });

  const stopResizing = (e) => {
    if (!isResizing) return;
    isResizing = false;
    try {
      DOM.splitResizer.releasePointerCapture(e.pointerId);
    } catch (_) {}
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    localStorage.setItem('doculens_viewer_width', state.viewerWidthPercent.toString());
  };

  window.addEventListener('pointerup', stopResizing);
  window.addEventListener('pointercancel', stopResizing);
}

function setupCtrlWheelZoom() {
  DOM.viewerViewport?.addEventListener(
    'wheel',
    (e) => {
      // Trigger zoom on Ctrl + Wheel or Pinch Trackpad gesture
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const zoomDelta = e.deltaY < 0 ? 0.08 : -0.08;
        updateZoom(state.zoom + zoomDelta);
      }
    },
    { passive: false }
  );
}

// ==============================================================================
// 6. PWA SERVICE WORKER REGISTRATION
// ==============================================================================

function registerPwaServiceWorker() {
  if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('./sw.js')
        .then((registration) => {
          console.log('DocuLens PWA ServiceWorker active:', registration.scope);
        })
        .catch((err) => {
          console.warn('PWA ServiceWorker error:', err);
        });
    });
  }
}

// ==============================================================================
// 7. SETTINGS & API KEY MANAGEMENT
// ==============================================================================

function updateApiKeyStatusBadge() {
  if (state.apiKey) {
    DOM.apiKeyStatusLabel.innerText = 'Key Set ✓';
    DOM.apiKeyStatusLabel.className = 'text-emerald-700 dark:text-emerald-400 font-semibold';
  } else {
    DOM.apiKeyStatusLabel.innerText = 'Set API Key';
    DOM.apiKeyStatusLabel.className = 'text-slate-700 dark:text-slate-300';
  }
  if (DOM.currentModelBadge) {
    DOM.currentModelBadge.innerText = state.model;
  }
}

function openSettingsModal() {
  DOM.apiKeyInput.value = state.apiKey;
  DOM.modelSelect.value = state.model;
  DOM.settingsModal.classList.remove('hidden');
}

function closeSettingsModal() {
  DOM.settingsModal.classList.add('hidden');
}

function saveSettingsModal() {
  state.apiKey = DOM.apiKeyInput.value.trim();
  state.model = DOM.modelSelect.value;
  localStorage.setItem('doculens_api_key', state.apiKey);
  localStorage.setItem('doculens_model', state.model);

  updateApiKeyStatusBadge();
  closeSettingsModal();
}

function setSimplicityLevel(level) {
  state.simplicityLevel = level;
  DOM.simplicityButtons.forEach((btn) => {
    if (btn.dataset.level === level) {
      btn.className =
        'simplicity-btn px-2 py-0.5 rounded-md font-medium bg-white dark:bg-slate-700 text-brand-700 dark:text-brand-300 shadow-2xs';
    } else {
      btn.className =
        'simplicity-btn px-2 py-0.5 rounded-md font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white';
    }
  });
}

// ==============================================================================
// 8. FILE PROCESSING & TEXT EXTRACTION
// ==============================================================================

function detectDocumentType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (['docx', 'doc'].includes(ext)) return 'docx';
  if (['pptx', 'ppt'].includes(ext)) return 'pptx';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'image';
  return 'text';
}

async function handleFileUpload(fileList) {
  const files = Array.from(fileList);
  const remainingSlots = 10 - state.documents.length;

  if (remainingSlots <= 0) {
    alert('Maximum of 10 documents allowed.');
    return;
  }

  const toAdd = files.slice(0, remainingSlots);

  for (const file of toAdd) {
    const type = detectDocumentType(file.name);
    const docItem = {
      id: `doc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: file.name,
      type: type,
      file: file,
      url: URL.createObjectURL(file),
      text: '',
      pageCount: 1,
      pagesText: [],
    };

    state.documents.push(docItem);

    if (!state.activeDocId) {
      state.activeDocId = docItem.id;
    }

    renderFileTrayTabs();
    renderActiveDocument();

    // Asynchronously extract text for Gemini multi-document context
    extractDocumentText(docItem);
  }
}

async function extractDocumentText(docItem) {
  try {
    // 1. PDF Text Extraction via PDF.js
    if (docItem.type === 'pdf') {
      const arrayBuffer = await docItem.file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      docItem.pageCount = pdf.numPages;
      docItem.pagesText = [];

      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item) => item.str).join(' ');
        docItem.pagesText.push(pageText);
      }

      docItem.text = docItem.pagesText
        .map((txt, idx) => `[Page ${idx + 1}]\n${txt}`)
        .join('\n\n');
    }

    // 2. DOCX Text Extraction via JSZip
    else if (docItem.type === 'docx') {
      const arrayBuffer = await docItem.file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);
      const xml = await zip.file('word/document.xml')?.async('text');

      if (xml) {
        const parser = new DOMParser();
        const dom = parser.parseFromString(xml, 'text/xml');
        const nodes = dom.getElementsByTagName('w:t');
        let text = '';
        for (let i = 0; i < nodes.length; i++) {
          text += nodes[i].textContent + ' ';
        }
        docItem.text = text.trim();
        docItem.pagesText = [docItem.text];
      }
    }

    // 3. PPTX Text Extraction via JSZip
    else if (docItem.type === 'pptx') {
      const arrayBuffer = await docItem.file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);
      const slidePaths = Object.keys(zip.files)
        .filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
        .sort((a, b) => {
          const numA = parseInt(a.match(/slide(\d+)\.xml/)?.[1] || '0', 10);
          const numB = parseInt(b.match(/slide(\d+)\.xml/)?.[1] || '0', 10);
          return numA - numB;
        });

      docItem.pageCount = Math.max(1, slidePaths.length);
      docItem.pagesText = [];
      const parser = new DOMParser();

      for (const sPath of slidePaths) {
        const sXml = await zip.files[sPath].async('text');
        const sDom = parser.parseFromString(sXml, 'text/xml');
        const textNodes = sDom.getElementsByTagName('a:t');
        let slideText = '';
        for (let j = 0; j < textNodes.length; j++) {
          slideText += textNodes[j].textContent + ' ';
        }
        docItem.pagesText.push(slideText.trim());
      }

      docItem.text = docItem.pagesText
        .map((txt, idx) => `[Slide ${idx + 1}]\n${txt}`)
        .join('\n\n');
    }

    // 4. Plain Text Extraction
    else if (docItem.type === 'text') {
      docItem.text = await docItem.file.text();
      docItem.pagesText = [docItem.text];
    }

    renderFileTrayTabs();
    updatePageCounter();
  } catch (error) {
    console.warn(`Text extraction failed for ${docItem.name}:`, error);
  }
}

function renderFileTrayTabs() {
  DOM.fileTray.innerHTML = '';

  state.documents.forEach((doc) => {
    const isActive = doc.id === state.activeDocId;
    const iconName =
      doc.type === 'pdf'
        ? 'file-text'
        : doc.type === 'pptx'
        ? 'presentation'
        : doc.type === 'docx'
        ? 'file-code'
        : 'file-image';

    const tab = document.createElement('div');
    tab.className = `group relative flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg cursor-pointer transition-all border shrink-0 max-w-[200px] select-none ${
      isActive
        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white border-gray-300 dark:border-slate-700 shadow-2xs ring-1 ring-brand-500/20'
        : 'bg-gray-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-700 border-transparent'
    }`;

    tab.innerHTML = `
      <i data-lucide="${iconName}" class="w-3.5 h-3.5 shrink-0 text-brand-600 dark:text-brand-400"></i>
      <span class="truncate" title="${doc.name}">${doc.name}</span>
      <button class="remove-doc-btn opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 dark:hover:bg-slate-600 rounded text-gray-400 hover:text-gray-700 dark:hover:text-white transition-opacity shrink-0">
        <i data-lucide="x" class="w-3 h-3"></i>
      </button>
    `;

    tab.addEventListener('click', (e) => {
      if (e.target.closest('.remove-doc-btn')) {
        e.stopPropagation();
        removeDocument(doc.id);
      } else {
        state.activeDocId = doc.id;
        state.currentPage = 1;
        renderFileTrayTabs();
        renderActiveDocument();
      }
    });

    DOM.fileTray.appendChild(tab);
  });

  if (state.documents.length < 10) {
    const addBtn = document.createElement('button');
    addBtn.className =
      'flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800 border border-dashed border-gray-300 dark:border-slate-700 rounded-lg transition-colors shrink-0';
    addBtn.innerHTML = `
      <i data-lucide="plus" class="w-3.5 h-3.5"></i>
      <span>Add</span>
      <span class="text-[10px] text-gray-400 font-normal">(${state.documents.length}/10)</span>
    `;
    addBtn.addEventListener('click', () => DOM.globalFileInput.click());
    DOM.fileTray.appendChild(addBtn);
  }

  if (window.lucide) {
    lucide.createIcons();
  }
}

function removeDocument(id) {
  state.documents = state.documents.filter((d) => d.id !== id);

  if (state.activeDocId === id) {
    state.activeDocId = state.documents.length > 0 ? state.documents[0].id : null;
    state.currentPage = 1;
  }

  if (state.activeSelection?.docId === id) {
    clearActiveSelection();
  }

  renderFileTrayTabs();
  renderActiveDocument();
}

function getActiveDocument() {
  return state.documents.find((d) => d.id === state.activeDocId);
}

// ==============================================================================
// 9. CONTINUOUS MULTI-PAGE DOCUMENT RENDERING
// ==============================================================================

async function renderActiveDocument() {
  const activeDoc = getActiveDocument();

  if (!activeDoc) {
    DOM.emptyStateDropzone.classList.remove('hidden');
    DOM.continuousPagesContainer.classList.add('hidden');
    DOM.continuousPagesContainer.innerHTML = '';
    DOM.pageCounterLabel.innerText = 'Page 1 / 1';
    return;
  }

  DOM.emptyStateDropzone.classList.add('hidden');
  DOM.continuousPagesContainer.classList.remove('hidden');
  DOM.continuousPagesContainer.innerHTML = '';

  updatePageCounter();

  if (activeDoc.type === 'pdf') {
    renderContinuousPdf(activeDoc);
  } else if (activeDoc.type === 'pptx') {
    renderContinuousPptx(activeDoc);
  } else if (activeDoc.type === 'docx') {
    renderContinuousDocx(activeDoc);
  } else if (activeDoc.type === 'image') {
    renderContinuousImage(activeDoc);
  }
}

// 9.1 PDF Continuous Multi-Page Vertical Rendering
async function renderContinuousPdf(doc) {
  const arrayBuffer = await doc.file.arrayBuffer();

  if (!state.currentPdfDoc || state.currentPdfDoc._docId !== doc.id) {
    state.currentPdfDoc = await pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
    }).promise;
    state.currentPdfDoc._docId = doc.id;
    doc.pageCount = state.currentPdfDoc.numPages;
    updatePageCounter();
  }

  const numPages = state.currentPdfDoc.numPages;

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await state.currentPdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: state.zoom * 1.5 });
    const displayViewport = page.getViewport({ scale: state.zoom });

    const pageCard = document.createElement('div');
    pageCard.id = `doc-page-card-${pageNum}`;
    pageCard.className =
      'doc-page-card relative bg-white rounded-lg shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden';
    pageCard.style.width = `${Math.floor(displayViewport.width)}px`;
    pageCard.style.height = `${Math.floor(displayViewport.height)}px`;
    pageCard.dataset.pageNumber = pageNum.toString();

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${Math.floor(displayViewport.width)}px`;
    canvas.style.height = `${Math.floor(displayViewport.height)}px`;
    canvas.className = 'block select-none pointer-events-none w-full h-full';

    const markerCanvas = document.createElement('canvas');
    markerCanvas.width = Math.floor(displayViewport.width);
    markerCanvas.height = Math.floor(displayViewport.height);
    markerCanvas.className = `marker-overlay-canvas absolute inset-0 z-20 ${
      state.isMarkerMode
        ? 'cursor-crosshair pointer-events-auto touch-none bg-emerald-500/[0.02]'
        : 'pointer-events-none'
    }`;
    markerCanvas.dataset.pageNumber = pageNum.toString();

    pageCard.appendChild(canvas);
    pageCard.appendChild(markerCanvas);
    DOM.continuousPagesContainer.appendChild(pageCard);

    // Render PDF page content
    const ctx = canvas.getContext('2d');
    page.render({ canvasContext: ctx, viewport });

    // Setup marker interaction on this page's overlay canvas
    setupPageMarkerEvents(markerCanvas, canvas, pageNum);

    // Draw existing highlight if selected on this page
    redrawSinglePageMarker(markerCanvas, pageNum);
  }

  setupScrollPageObserver();
}

// 9.2 PPTX Continuous Slide Vertical Rendering
async function renderContinuousPptx(doc) {
  const baseW = Math.floor(960 * state.zoom);
  const baseH = Math.floor(540 * state.zoom);
  const numSlides = doc.pageCount || 1;

  for (let slideNum = 1; slideNum <= numSlides; slideNum++) {
    const pageCard = document.createElement('div');
    pageCard.id = `doc-page-card-${slideNum}`;
    pageCard.className =
      'doc-page-card relative bg-white rounded-lg shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden';
    pageCard.style.width = `${baseW}px`;
    pageCard.style.height = `${baseH}px`;
    pageCard.dataset.pageNumber = slideNum.toString();

    const canvas = document.createElement('canvas');
    canvas.width = 960 * 1.5;
    canvas.height = 540 * 1.5;
    canvas.style.width = `${baseW}px`;
    canvas.style.height = `${baseH}px`;
    canvas.className = 'block select-none pointer-events-none w-full h-full';

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FAFAFA';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 3;
    ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);

    ctx.fillStyle = '#64748B';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(`Slide ${slideNum} of ${numSlides}`, 40, 60);

    const slideText = doc.pagesText[slideNum - 1] || 'Slide Content';
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 36px sans-serif';

    const words = slideText.split(/\s+/).slice(0, 40);
    let y = 120;
    ctx.fillText(words.slice(0, 6).join(' '), 40, y);
    y += 60;

    ctx.font = '24px sans-serif';
    ctx.fillStyle = '#334155';
    for (let i = 6; i < words.length; i += 8) {
      ctx.fillText('• ' + words.slice(i, i + 8).join(' '), 40, y);
      y += 45;
      if (y > canvas.height - 60) break;
    }

    const markerCanvas = document.createElement('canvas');
    markerCanvas.width = baseW;
    markerCanvas.height = baseH;
    markerCanvas.className = `marker-overlay-canvas absolute inset-0 z-20 ${
      state.isMarkerMode
        ? 'cursor-crosshair pointer-events-auto touch-none bg-emerald-500/[0.02]'
        : 'pointer-events-none'
    }`;
    markerCanvas.dataset.pageNumber = slideNum.toString();

    pageCard.appendChild(canvas);
    pageCard.appendChild(markerCanvas);
    DOM.continuousPagesContainer.appendChild(pageCard);

    setupPageMarkerEvents(markerCanvas, canvas, slideNum);
    redrawSinglePageMarker(markerCanvas, slideNum);
  }

  setupScrollPageObserver();
}

// 9.3 DOCX Continuous Document Rendering
async function renderContinuousDocx(doc) {
  const pageCard = document.createElement('div');
  pageCard.id = 'doc-page-card-1';
  pageCard.className =
    'doc-page-card relative bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-gray-200 dark:border-slate-800 p-6 min-h-[600px] w-full max-w-4xl origin-top transition-transform';
  pageCard.style.transform = `scale(${state.zoom})`;
  pageCard.style.transformOrigin = 'top center';
  pageCard.dataset.pageNumber = '1';

  DOM.continuousPagesContainer.appendChild(pageCard);

  try {
    await docx.renderAsync(doc.file, pageCard, undefined, {
      className: 'docx',
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
    });
  } catch (err) {
    pageCard.innerHTML = `<p class="text-red-500">Error rendering DOCX: ${err.message}</p>`;
  }
}

// 9.4 Image Continuous Rendering
async function renderContinuousImage(doc) {
  const pageCard = document.createElement('div');
  pageCard.id = 'doc-page-card-1';
  pageCard.className =
    'doc-page-card relative bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden';
  pageCard.dataset.pageNumber = '1';

  const img = document.createElement('img');
  img.src = doc.url;
  img.className = 'block select-none pointer-events-none object-contain w-full h-auto';

  pageCard.appendChild(img);
  DOM.continuousPagesContainer.appendChild(pageCard);

  img.onload = () => {
    const w = Math.floor(img.clientWidth * state.zoom);
    const h = Math.floor(img.clientHeight * state.zoom);
    pageCard.style.width = `${w}px`;
    pageCard.style.height = `${h}px`;

    const markerCanvas = document.createElement('canvas');
    markerCanvas.width = w;
    markerCanvas.height = h;
    markerCanvas.className = `marker-overlay-canvas absolute inset-0 z-20 ${
      state.isMarkerMode
        ? 'cursor-crosshair pointer-events-auto touch-none bg-emerald-500/[0.02]'
        : 'pointer-events-none'
    }`;
    markerCanvas.dataset.pageNumber = '1';

    pageCard.appendChild(markerCanvas);
    setupPageMarkerEvents(markerCanvas, img, 1);
    redrawSinglePageMarker(markerCanvas, 1);
  };
}

// 9.5 Scroll Observer for Page Counter & Navigation
function setupScrollPageObserver() {
  const pageCards = DOM.continuousPagesContainer.querySelectorAll('.doc-page-card');
  if (pageCards.length <= 1) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const pNum = parseInt(entry.target.dataset.pageNumber || '1', 10);
          state.currentPage = pNum;
          updatePageCounter();
        }
      });
    },
    {
      root: DOM.viewerViewport,
      threshold: 0.4,
    }
  );

  pageCards.forEach((card) => observer.observe(card));
}

function scrollToPage(pageNum) {
  const activeDoc = getActiveDocument();
  if (!activeDoc) return;

  const maxPages = activeDoc.pageCount || 1;
  const targetPage = Math.min(Math.max(1, pageNum), maxPages);
  state.currentPage = targetPage;
  updatePageCounter();

  const targetCard = document.getElementById(`doc-page-card-${targetPage}`);
  if (targetCard) {
    targetCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function updatePageCounter() {
  const activeDoc = getActiveDocument();
  const count = activeDoc?.pageCount || 1;
  DOM.pageCounterLabel.innerText = `Page ${state.currentPage} / ${count}`;
  DOM.btnPrevPage.disabled = state.currentPage <= 1;
  DOM.btnNextPage.disabled = state.currentPage >= count;
}

function updateZoom(newZoom) {
  state.zoom = Math.min(Math.max(0.4, newZoom), 3.0);
  DOM.zoomLabel.innerText = `${Math.round(state.zoom * 100)}%`;
  renderActiveDocument();
}

// ==============================================================================
// 10. FREEHAND MARKER TOOL & CROPPING
// ==============================================================================

function toggleMarkerMode() {
  state.isMarkerMode = !state.isMarkerMode;

  const markerCanvases = DOM.continuousPagesContainer.querySelectorAll('.marker-overlay-canvas');

  if (state.isMarkerMode) {
    DOM.btnMarkerToggle.className =
      'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg transition-all shadow-2xs bg-brand-600 text-white ring-2 ring-brand-500';
    DOM.markerBtnText.innerText = 'Drawing Active';

    markerCanvases.forEach((c) => {
      c.classList.remove('pointer-events-none');
      c.classList.add('cursor-crosshair', 'pointer-events-auto', 'touch-none');
    });
  } else {
    DOM.btnMarkerToggle.className =
      'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg transition-all shadow-2xs bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 border border-gray-300 dark:border-slate-700';
    DOM.markerBtnText.innerText = 'Marker Tool';

    markerCanvases.forEach((c) => {
      c.classList.add('pointer-events-none');
      c.classList.remove('cursor-crosshair', 'pointer-events-auto', 'touch-none');
    });
  }
}

function setupPageMarkerEvents(markerCanvas, sourceElement, pageNum) {
  const getCoordinates = (e) => {
    const rect = markerCanvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  markerCanvas.addEventListener('pointerdown', (e) => {
    if (!state.isMarkerMode) return;
    e.preventDefault();
    markerCanvas.setPointerCapture(e.pointerId);

    state.isDrawing = true;
    state.drawingPageNumber = pageNum;
    const pt = getCoordinates(e);
    state.pathPoints = [pt];

    const ctx = markerCanvas.getContext('2d');
    ctx.clearRect(0, 0, markerCanvas.width, markerCanvas.height);
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
  });

  markerCanvas.addEventListener('pointermove', (e) => {
    if (!state.isMarkerMode || !state.isDrawing || state.drawingPageNumber !== pageNum) return;
    e.preventDefault();

    const pt = getCoordinates(e);
    state.pathPoints.push(pt);

    const ctx = markerCanvas.getContext('2d');
    ctx.strokeStyle = '#10A37F';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
  });

  const finishDrawing = (e) => {
    if (!state.isMarkerMode || !state.isDrawing || state.drawingPageNumber !== pageNum) return;
    e.preventDefault();

    try {
      markerCanvas.releasePointerCapture(e.pointerId);
    } catch (_) {}

    state.isDrawing = false;
    if (state.pathPoints.length < 2) return;

    // Compute bounding box coordinates
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const pt of state.pathPoints) {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }

    const bbox = {
      x: minX,
      y: minY,
      width: Math.max(10, maxX - minX),
      height: Math.max(10, maxY - minY),
    };

    // Crop selection from canvas or image
    const croppedDataUrl = cropSelectionFromCanvas(sourceElement, markerCanvas, bbox);

    if (croppedDataUrl) {
      const activeDoc = getActiveDocument();
      state.activeSelection = {
        docId: activeDoc.id,
        docName: activeDoc.name,
        pageNumber: pageNum,
        dataUrl: croppedDataUrl,
        bbox: bbox,
        pathPoints: state.pathPoints,
      };

      displaySelectionTargetChip();
      toggleMarkerMode(); // Exit marker mode after selection
      redrawAllPageMarkers();
    }
  };

  markerCanvas.addEventListener('pointerup', finishDrawing);
  markerCanvas.addEventListener('pointercancel', finishDrawing);
}

function cropSelectionFromCanvas(sourceElement, markerCanvas, bbox) {
  if (!sourceElement) return null;

  const naturalW = sourceElement.naturalWidth || sourceElement.width;
  const naturalH = sourceElement.naturalHeight || sourceElement.height;
  const scaleX = naturalW / markerCanvas.width;
  const scaleY = naturalH / markerCanvas.height;

  const pad = 10;
  const sx = Math.max(0, (bbox.x - pad) * scaleX);
  const sy = Math.max(0, (bbox.y - pad) * scaleY);
  const sw = Math.min(naturalW - sx, (bbox.width + pad * 2) * scaleX);
  const sh = Math.min(naturalH - sy, (bbox.height + pad * 2) * scaleY);

  const offscreen = document.createElement('canvas');
  offscreen.width = Math.min(900, Math.round(sw));
  offscreen.height = Math.min(900, Math.round(sh));

  const ctx = offscreen.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, offscreen.width, offscreen.height);
  ctx.drawImage(sourceElement, sx, sy, sw, sh, 0, 0, offscreen.width, offscreen.height);

  return offscreen.toDataURL('image/png', 0.92);
}

function redrawSinglePageMarker(markerCanvas, pageNum) {
  const ctx = markerCanvas.getContext('2d');
  ctx.clearRect(0, 0, markerCanvas.width, markerCanvas.height);

  const activeDoc = getActiveDocument();

  if (
    state.activeSelection &&
    activeDoc &&
    state.activeSelection.docId === activeDoc.id &&
    state.activeSelection.pageNumber === pageNum
  ) {
    const { bbox, pathPoints } = state.activeSelection;

    ctx.save();
    ctx.strokeStyle = '#10A37F';
    ctx.fillStyle = 'rgba(16, 163, 127, 0.14)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(bbox.x, bbox.y, bbox.width, bbox.height);
    ctx.fillRect(bbox.x, bbox.y, bbox.width, bbox.height);

    if (pathPoints && pathPoints.length > 1) {
      ctx.setLineDash([]);
      ctx.strokeStyle = '#059669';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pathPoints[0].x, pathPoints[0].y);
      for (let i = 1; i < pathPoints.length; i++) {
        ctx.lineTo(pathPoints[i].x, pathPoints[i].y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

function redrawAllPageMarkers() {
  const markerCanvases = DOM.continuousPagesContainer.querySelectorAll('.marker-overlay-canvas');
  markerCanvases.forEach((c) => {
    const pNum = parseInt(c.dataset.pageNumber || '1', 10);
    redrawSinglePageMarker(c, pNum);
  });
}

function displaySelectionTargetChip() {
  if (state.activeSelection) {
    DOM.chipThumbnail.src = state.activeSelection.dataUrl;
    DOM.chipMeta.innerText = `${state.activeSelection.docName} (Page ${state.activeSelection.pageNumber})`;
    DOM.activeSelectionChip.classList.remove('hidden');
    DOM.btnClearMark.classList.remove('hidden');
  }
}

function clearActiveSelection() {
  state.activeSelection = null;
  DOM.activeSelectionChip.classList.add('hidden');
  DOM.btnClearMark.classList.add('hidden');
  redrawAllPageMarkers();
}

// ==============================================================================
// 11. CHAT & GOOGLE GEMINI API STREAMING
// ==============================================================================

async function submitChatMessage(question) {
  if (!question || state.isStreaming) return;

  // Ensure API Key is configured
  if (!state.apiKey) {
    DOM.apiKeyInput.value = '';
    DOM.settingsModal.classList.remove('hidden');
    alert('Please enter your Google Gemini API Key in Settings to start.');
    return;
  }

  // Append user message bubble
  const selectionThumbnail = state.activeSelection?.dataUrl;
  appendUserMessageBubble(question, selectionThumbnail);

  // Append placeholder for assistant response
  const messageId = `msg_${Date.now()}`;
  appendAssistantPlaceholder(messageId);

  state.isStreaming = true;
  DOM.chatSendBtn.disabled = true;

  // Build Reading Level System Instruction
  let readingLevelPrompt =
    'Explain in simple, intuitive terms with clear analogies for a first-year student.';
  if (state.simplicityLevel === 'standard') {
    readingLevelPrompt =
      'Explain clearly and thoroughly, suitable for college-level study.';
  } else if (state.simplicityLevel === 'technical') {
    readingLevelPrompt =
      'Provide formal, rigorous, and technically precise explanations with mathematics and depth.';
  }

  // Build System Prompt
  const systemPrompt = `You are DocuLens, an expert AI document analyzer and study assistant.
Guidelines:
1. Tone and Reading Level: ${readingLevelPrompt}
2. Vector Diagrams: Whenever a flowchart, timeline, concept hierarchy, or relationship diagram would make the answer clearer, output a \`\`\`mermaid\`\`\` code block with valid Mermaid syntax (e.g. flowchart TD, graph TD, sequenceDiagram, mindmap). The frontend will render it as a crisp vector graphic.
3. Region Focus: If an image of a marked region is provided, answer primarily about what is shown in that visual selection.
4. Attribution: When citing facts from uploaded files, reference [Source: filename].`;

  // Format multi-document context
  let documentContext = state.documents
    .map((d) => `--- Source: ${d.name} ---\n${d.text || '[No text extracted]'}`)
    .join('\n\n');

  if (!documentContext) {
    documentContext = 'No document uploaded.';
  }

  // Construct Gemini Parts
  const userParts = [];

  if (state.activeSelection) {
    const base64Data = state.activeSelection.dataUrl.split(',')[1];
    userParts.push({
      inlineData: {
        mimeType: 'image/png',
        data: base64Data,
      },
    });
    userParts.push({
      text: '[User marked a visual region from their document. The cropped image of the marked region is attached above.]',
    });
  }

  const promptWithContext = `=== SYSTEM INSTRUCTIONS ===\n${systemPrompt}\n\n=== DOCUMENT CONTEXT (${state.documents.length} file(s)) ===\n${documentContext}\n\n=== USER QUESTION ===\n${question}`;
  userParts.push({ text: promptWithContext });

  const contents = [
    ...state.messages.map((m) => ({
      role: m.role === 'model' ? 'model' : 'user',
      parts: [{ text: m.text }],
    })),
    {
      role: 'user',
      parts: userParts,
    },
  ];

  let activeModel = state.model;
  let accumulatedResponseText = '';

  try {
    let endpointUrl = `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:streamGenerateContent?key=${state.apiKey}&alt=sse`;

    let response = await fetch(endpointUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents }),
    });

    // If 404 or 400 (e.g. deprecated model or model not found for project), attempt automatic fallback
    if (!response.ok && (response.status === 404 || response.status === 400)) {
      const errorJson = await response.json().catch(() => ({}));
      const errMsg = errorJson.error?.message || '';

      const fallbackCandidates = ['gemini-3.6-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'].filter(
        (m) => m !== activeModel
      );

      let fallbackSucceeded = false;
      for (const fallbackModel of fallbackCandidates) {
        const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/${fallbackModel}:streamGenerateContent?key=${state.apiKey}&alt=sse`;
        const testRes = await fetch(fallbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents }),
        });

        if (testRes.ok) {
          response = testRes;
          activeModel = fallbackModel;
          state.model = fallbackModel;
          localStorage.setItem('doculens_model', fallbackModel);
          if (DOM.modelSelect) DOM.modelSelect.value = fallbackModel;
          if (DOM.currentModelBadge) DOM.currentModelBadge.innerText = fallbackModel;
          fallbackSucceeded = true;
          break;
        }
      }

      if (!fallbackSucceeded && !response.ok) {
        throw new Error(errMsg || `HTTP ${response.status}: Gemini API request failed`);
      }
    } else if (!response.ok) {
      const errorJson = await response.json().catch(() => ({}));
      throw new Error(
        errorJson.error?.message || `HTTP ${response.status}: Gemini API request failed`
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let sseBuffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      sseBuffer += decoder.decode(value, { stream: true });
      const lines = sseBuffer.split('\n');
      sseBuffer = lines.pop(); // Keep partial line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonString = line.replace(/^data:\s*/, '').trim();
          if (!jsonString) continue;

          try {
            const parsedData = JSON.parse(jsonString);
            const chunkText =
              parsedData.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (chunkText) {
              accumulatedResponseText += chunkText;
              updateAssistantMessageContent(messageId, accumulatedResponseText);
            }
          } catch (_) {
            // Partial JSON ignored
          }
        }
      }
    }

    // Record turn in history
    state.messages.push({ role: 'user', text: question });
    state.messages.push({ role: 'model', text: accumulatedResponseText });

    // Render Mermaid diagrams inside the completed answer
    renderMermaidInMessage(messageId);
  } catch (err) {
    console.error('Chat generation error:', err);
    updateAssistantMessageContent(
      messageId,
      `⚠️ **Error:** ${err.message}\n\n*Tip: Check that your Gemini API Key in Settings is valid and has access to ${state.model}.*`
    );
  } finally {
    state.isStreaming = false;
    DOM.chatSendBtn.disabled = false;
  }
}

function appendUserMessageBubble(text, thumbnailDataUrl) {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'flex gap-3 leading-relaxed justify-end';

  let thumbnailHtml = '';
  if (thumbnailDataUrl) {
    thumbnailHtml = `
      <div class="cursor-pointer group mb-2 p-1.5 bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 border border-gray-200 dark:border-slate-700 rounded-xl max-w-[240px] shadow-2xs transition-all" title="Click to open large and zoom">
        <div class="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
          <span>📍 Analyzed Selection</span>
          <span class="text-brand-600 dark:text-brand-400 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
            <i data-lucide="maximize-2" class="w-2.5 h-2.5"></i> Enlarge
          </span>
        </div>
        <img src="${thumbnailDataUrl}" class="rounded-lg border border-gray-200 dark:border-slate-700 max-h-32 object-contain w-full bg-white dark:bg-slate-800 group-hover:opacity-95 transition-opacity" />
      </div>`;
  }

  msgDiv.innerHTML = `
    <div class="flex flex-col max-w-[90%] items-end">
      ${thumbnailHtml}
      <div class="px-4 py-3 rounded-2xl bg-brand-500 text-white rounded-br-sm shadow-2xs">
        <p class="whitespace-pre-wrap">${escapeHtml(text)}</p>
      </div>
    </div>
    <div class="w-7 h-7 rounded-lg bg-gray-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0 mt-0.5">
      <i data-lucide="user" class="w-4 h-4"></i>
    </div>
  `;

  if (thumbnailDataUrl) {
    const thumbEl = msgDiv.querySelector('.cursor-pointer');
    thumbEl?.addEventListener('click', () => {
      openLightbox({
        type: 'image',
        title: 'Analyzed Region Selection',
        content: thumbnailDataUrl,
      });
    });
  }

  DOM.messagesList.appendChild(msgDiv);
  DOM.messagesList.scrollTop = DOM.messagesList.scrollHeight;

  if (window.lucide) {
    lucide.createIcons();
  }
}

function appendAssistantPlaceholder(messageId) {
  const msgDiv = document.createElement('div');
  msgDiv.id = messageId;
  msgDiv.className = 'flex gap-3 leading-relaxed justify-start';

  msgDiv.innerHTML = `
    <div class="w-7 h-7 rounded-lg bg-brand-500 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
      <i data-lucide="sparkles" class="w-4 h-4"></i>
    </div>
    <div class="flex flex-col max-w-[90%] items-start w-full">
      <div class="msg-content px-4 py-3 rounded-2xl bg-[#F7F7F8] dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-bl-sm border border-gray-200 dark:border-slate-700 shadow-2xs w-full prose">
        <span class="text-brand-600 dark:text-brand-400 animate-pulse text-xs">Thinking & analyzing...</span>
      </div>
    </div>
  `;

  DOM.messagesList.appendChild(msgDiv);
  DOM.messagesList.scrollTop = DOM.messagesList.scrollHeight;

  if (window.lucide) {
    lucide.createIcons();
  }
}

function updateAssistantMessageContent(messageId, markdownText) {
  const container = document.querySelector(`#${messageId} .msg-content`);
  if (container && window.marked) {
    container.innerHTML = marked.parse(markdownText);

    // Make markdown images clickable to open in zoomable lightbox
    const images = container.querySelectorAll('img');
    images.forEach((img) => {
      img.classList.add('cursor-pointer', 'hover:opacity-90', 'transition-opacity', 'rounded-lg', 'shadow-xs');
      img.title = 'Click to open large & zoom';
      img.addEventListener('click', () => {
        openLightbox({
          type: 'image',
          title: img.alt || 'Document Image',
          content: img.src,
        });
      });
    });

    DOM.messagesList.scrollTop = DOM.messagesList.scrollHeight;
  }
}

function resetChatHistory() {
  DOM.messagesList.innerHTML = `
    <div class="flex gap-3 leading-relaxed justify-start">
      <div class="w-7 h-7 rounded-lg bg-brand-500 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
        <i data-lucide="sparkles" class="w-4 h-4"></i>
      </div>
      <div class="flex flex-col max-w-[90%] items-start">
        <div class="px-4 py-3 rounded-2xl bg-[#F7F7F8] dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-bl-sm border border-gray-200 dark:border-slate-700 shadow-2xs w-full prose">
          <p>Chat cleared. Ask anything about your uploaded documents or marked regions!</p>
        </div>
      </div>
    </div>`;

  state.messages = [];
  if (window.lucide) {
    lucide.createIcons();
  }
}

// ==============================================================================
// 12. MERMAID DIAGRAM & MARKDOWN RENDERING
// ==============================================================================

async function renderMermaidInMessage(messageId) {
  const container = document.querySelector(`#${messageId} .msg-content`);
  if (!container || !window.mermaid) return;

  const codeBlocks = container.querySelectorAll('code.language-mermaid, pre code');
  let diagramIndex = 0;

  for (const code of codeBlocks) {
    const diagramCode = code.innerText.trim();
    const isMermaid =
      diagramCode.startsWith('graph ') ||
      diagramCode.startsWith('flowchart ') ||
      diagramCode.startsWith('sequenceDiagram') ||
      diagramCode.startsWith('mindmap') ||
      diagramCode.startsWith('classDiagram') ||
      diagramCode.startsWith('stateDiagram') ||
      diagramCode.startsWith('erDiagram') ||
      diagramCode.startsWith('gantt') ||
      diagramCode.startsWith('pie') ||
      code.classList.contains('language-mermaid');

    if (isMermaid) {
      try {
        const uniqueDiagramId = `mermaid_${messageId}_${diagramIndex++}`;
        const { svg } = await mermaid.render(uniqueDiagramId, diagramCode);

        const wrapper = document.createElement('div');
        wrapper.className =
          'diagram-interactive-card group relative my-4 p-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:border-brand-500 dark:hover:border-brand-500 rounded-xl shadow-2xs overflow-hidden cursor-pointer';
        
        wrapper.innerHTML = `
          <div class="flex items-center justify-between mb-2 text-xs font-medium text-slate-500 dark:text-slate-400 border-b border-gray-100 dark:border-slate-700 pb-1.5">
            <span class="flex items-center gap-1.5 text-brand-700 dark:text-brand-400 font-semibold">
              <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
              Interactive Vector Diagram
            </span>
            <button type="button" class="open-diagram-btn flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/60 hover:bg-brand-100 dark:hover:bg-brand-900/80 border border-brand-200 dark:border-brand-800/60 rounded-md transition-colors" title="Click to open large & zoom">
              <i data-lucide="maximize-2" class="w-3 h-3"></i>
              <span>Expand & Zoom</span>
            </button>
          </div>
          <div class="mermaid-svg-container flex items-center justify-center p-2 overflow-x-auto min-h-[120px] transition-transform duration-200 group-hover:scale-[1.01]">
            ${svg}
          </div>
          <div class="mt-1 text-center text-[11px] text-slate-400 dark:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
            🔍 Click anywhere on the diagram to open large & zoom
          </div>
        `;

        wrapper.addEventListener('click', () => {
          openLightbox({
            type: 'svg',
            title: 'Interactive Vector Diagram',
            content: svg,
          });
        });

        const pre = code.closest('pre');
        if (pre) {
          pre.replaceWith(wrapper);
        } else {
          code.replaceWith(wrapper);
        }
      } catch (err) {
        console.warn('Mermaid rendering skipped:', err);
      }
    }
  }

  if (window.lucide) {
    lucide.createIcons();
  }
}

// ==============================================================================
// 13. INTERACTIVE DIAGRAM & IMAGE LIGHTBOX VIEWER
// ==============================================================================

const lightbox = {
  isOpen: false,
  scale: 1.0,
  panX: 0,
  panY: 0,
  isDragging: false,
  startX: 0,
  startY: 0,
  initialPanX: 0,
  initialPanY: 0,
  currentType: 'svg', // 'svg' | 'image'
  currentContent: '',
};

function openLightbox({ type = 'svg', title = 'Interactive Diagram', content = '' }) {
  if (!DOM.lightboxModal || !DOM.lightboxTransformLayer) return;

  lightbox.isOpen = true;
  lightbox.scale = 1.0;
  lightbox.panX = 0;
  lightbox.panY = 0;
  lightbox.isDragging = false;
  lightbox.currentType = type;
  lightbox.currentContent = content;

  if (DOM.lightboxTitle) {
    DOM.lightboxTitle.innerText = title;
  }

  if (DOM.lightboxCopyText) {
    DOM.lightboxCopyText.innerText = type === 'svg' ? 'Copy SVG' : 'Copy Image';
  }

  // Inject content inside high-contrast canvas card
  if (type === 'svg') {
    DOM.lightboxTransformLayer.innerHTML = `
      <div class="diagram-canvas-card">
        <div class="w-full flex items-center justify-center">
          ${content}
        </div>
      </div>
    `;
    const svgEl = DOM.lightboxTransformLayer.querySelector('svg');
    if (svgEl) {
      svgEl.style.display = 'block';
      svgEl.style.maxWidth = '100%';
      svgEl.style.height = 'auto';
    }
  } else {
    DOM.lightboxTransformLayer.innerHTML = `
      <div class="diagram-canvas-card">
        <img src="${content}" alt="${title}" class="max-w-[75vw] max-h-[65vh] object-contain select-none" />
      </div>
    `;
  }

  updateLightboxTransform();
  DOM.lightboxModal.classList.remove('hidden');

  if (window.lucide) {
    lucide.createIcons();
  }
}

function closeLightbox() {
  if (!DOM.lightboxModal) return;
  lightbox.isOpen = false;
  DOM.lightboxModal.classList.add('hidden');
  if (DOM.lightboxTransformLayer) {
    DOM.lightboxTransformLayer.innerHTML = '';
  }
}

function updateLightboxTransform() {
  if (!DOM.lightboxTransformLayer) return;
  DOM.lightboxTransformLayer.style.transform = `translate(${lightbox.panX}px, ${lightbox.panY}px) scale(${lightbox.scale})`;
  if (DOM.lightboxZoomLabel) {
    DOM.lightboxZoomLabel.innerText = `${Math.round(lightbox.scale * 100)}%`;
  }
}

function setLightboxZoom(newScale) {
  lightbox.scale = Math.min(Math.max(newScale, 0.2), 8.0);
  updateLightboxTransform();
}

function resetLightboxView() {
  lightbox.scale = 1.0;
  lightbox.panX = 0;
  lightbox.panY = 0;
  updateLightboxTransform();
}

function setupLightboxEvents() {
  if (!DOM.lightboxModal) return;

  DOM.lightboxBtnClose?.addEventListener('click', closeLightbox);
  DOM.lightboxBtnReset?.addEventListener('click', resetLightboxView);

  const backdropDismiss = document.getElementById('lightbox-backdrop-dismiss');
  backdropDismiss?.addEventListener('click', closeLightbox);

  DOM.lightboxBtnZoomIn?.addEventListener('click', (e) => {
    e.stopPropagation();
    setLightboxZoom(lightbox.scale * 1.25);
  });

  DOM.lightboxBtnZoomOut?.addEventListener('click', (e) => {
    e.stopPropagation();
    setLightboxZoom(lightbox.scale / 1.25);
  });

  // Copy button
  DOM.lightboxBtnCopy?.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      if (lightbox.currentType === 'svg') {
        await navigator.clipboard.writeText(lightbox.currentContent);
      } else {
        await navigator.clipboard.writeText(lightbox.currentContent);
      }
      if (DOM.lightboxCopyText) {
        const orig = DOM.lightboxCopyText.innerText;
        DOM.lightboxCopyText.innerText = 'Copied! ✓';
        setTimeout(() => {
          DOM.lightboxCopyText.innerText = orig;
        }, 1800);
      }
    } catch (err) {
      console.error('Failed to copy content:', err);
    }
  });

  // Mouse / Touch drag to pan
  DOM.lightboxViewport?.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    lightbox.isDragging = true;
    lightbox.startX = e.clientX;
    lightbox.startY = e.clientY;
    lightbox.initialPanX = lightbox.panX;
    lightbox.initialPanY = lightbox.panY;
    DOM.lightboxViewport.setPointerCapture(e.pointerId);
  });

  DOM.lightboxViewport?.addEventListener('pointermove', (e) => {
    if (!lightbox.isDragging) return;
    const dx = e.clientX - lightbox.startX;
    const dy = e.clientY - lightbox.startY;
    lightbox.panX = lightbox.initialPanX + dx;
    lightbox.panY = lightbox.initialPanY + dy;
    updateLightboxTransform();
  });

  const endDrag = (e) => {
    if (lightbox.isDragging) {
      lightbox.isDragging = false;
      try {
        DOM.lightboxViewport?.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }
  };

  DOM.lightboxViewport?.addEventListener('pointerup', endDrag);
  DOM.lightboxViewport?.addEventListener('pointercancel', endDrag);

  // Wheel zoom
  DOM.lightboxViewport?.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      setLightboxZoom(lightbox.scale * zoomFactor);
    },
    { passive: false }
  );

  // Keyboard Escape
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lightbox.isOpen) {
      closeLightbox();
    } else if (lightbox.isOpen && (e.key === '+' || e.key === '=')) {
      setLightboxZoom(lightbox.scale * 1.2);
    } else if (lightbox.isOpen && (e.key === '-' || e.key === '_')) {
      setLightboxZoom(lightbox.scale / 1.2);
    } else if (lightbox.isOpen && e.key === '0') {
      resetLightboxView();
    }
  });
}

// ==============================================================================
// 14. UTILITY & HELPER FUNCTIONS
// ==============================================================================

function switchMobileTab(target) {
  if (target === 'viewer') {
    DOM.viewerContainer.classList.remove('hidden');
    DOM.chatContainer.classList.add('hidden');
    DOM.mobileTabViewer.className =
      'flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-white dark:bg-slate-700 text-brand-700 dark:text-brand-300 shadow-2xs';
    DOM.mobileTabChat.className =
      'flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium text-gray-500 dark:text-gray-400';
  } else {
    DOM.viewerContainer.classList.add('hidden');
    DOM.chatContainer.classList.remove('hidden');
    DOM.mobileTabChat.className =
      'flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-white dark:bg-slate-700 text-brand-700 dark:text-brand-300 shadow-2xs';
    DOM.mobileTabViewer.className =
      'flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium text-gray-500 dark:text-gray-400';
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Start Application on Load
window.addEventListener('DOMContentLoaded', initApp);

