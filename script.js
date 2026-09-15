// script.js
// ============================================================
// QBank Medicina Perú - Lógica principal (multi-banco)
// ============================================================

(function () {
    'use strict';

    const SOURCES_URL = 'data/sources.json';
    const MODE_PRACTICE = 'practice';
    const MODE_SIMULACRO = 'simulacro';

    // ID virtual para el modo "Todos los bancos"
    const SOURCE_ALL_ID = '__all__';

    const WARN_THRESHOLD_1 = 15 * 60;
    const WARN_THRESHOLD_2 = 5 * 60;
    const WARN_THRESHOLD_3 = 60;

    const STORAGE_KEY_SIMULACRO = 'qbank_simulacro_v1';
    const STORAGE_KEY_SOURCE = 'qbank_source_v1';
    const STORAGE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

    // ------------------------------------------------------------
    // Iconos SVG reutilizables (stroke 2, currentColor)
    // ------------------------------------------------------------
    const ICONS = {
        check: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg>',
        x: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
        flag: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>',
        square: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>',
        pencil: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
        bulb: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg>',
        bookOpen: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
        refresh: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
        copy: '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
    };

    // ============================================================
    // 2. ESTADO GLOBAL
    // ============================================================
    let preguntas = [];
    let filteredIds = [];
    let sessionIds = [];
    let currentIndex = 0;
    let currentMode = MODE_PRACTICE;
    let selectedCount = 20;

    let currentEnfoque = 'all';
    let selectedTimeLimitMin = null;

    let practiceAnswers = {};
    let practiceFeedback = {};
    let practiceRevealed = {};

    let simulacroState = {
        answers: {},
        flagged: new Set(),
        revealed: false,
        startTime: null,
        endTime: null,
        timeLimit: null,
        remaining: null,
        elapsedPrevios: 0,
        timeUp: false,
        warnLevel: 0
    };

    let usedSessionIds = new Set();
    let modalSelectedCount = 10;

    let reviewFilter = 'all';
    let reviewIds = [];
    let reviewIndex = 0;

    let pendingResumeData = null;

    // --- Multi-banco ---
    let dataSources = [];      // manifiesto completo de data/sources.json
    let currentSource = null;  // { id, name, description, file } | { id: '__all__', ... }

    // ============================================================
    // 3. REFERENCIAS AL DOM
    // ============================================================
    const body = document.body;

    const screenSetup = document.getElementById('screenSetup');
    const screenQuiz = document.getElementById('screenQuiz');
    const screenResults = document.getElementById('screenResults');
    const screenReview = document.getElementById('screenReview');

    const setupModePractice = document.getElementById('setupModePractice');
    const setupModeSimulacro = document.getElementById('setupModeSimulacro');
    const modeHelp = document.getElementById('modeHelp');
    const startSessionBtn = document.getElementById('startSession');
    const summaryMode = document.getElementById('summaryMode');
    const summaryFilters = document.getElementById('summaryFilters');
    const summaryAvailable = document.getElementById('summaryAvailable');
    const summaryCount = document.getElementById('summaryCount');
    const summaryTimeLine = document.getElementById('summaryTimeLine');
    const summaryTime = document.getElementById('summaryTime');
    const countButtons = document.querySelectorAll('.count-btn:not(.time-btn)');
    const customCountInput = document.getElementById('customCount');
    const shuffleCheckbox = document.getElementById('shuffleQuestions');

    const enfoqueBtns = document.querySelectorAll('.enfoque-btn');
    const perfilResumen = document.getElementById('perfilResumen');

    const timeBlock = document.getElementById('timeBlock');
    const customTimeInput = document.getElementById('customTime');

    const filterSource = document.getElementById('filterSource');
    const filterArea = document.getElementById('filterArea');
    const filterEspecialidad = document.getElementById('filterEspecialidad');
    const filterTema = document.getElementById('filterTema');
    const filterDificultad = document.getElementById('filterDificultad');
    const filterEstado = document.getElementById('filterEstado');
    const resetBtn = document.getElementById('resetFilters');
    const totalSpan = document.getElementById('totalQuestions');

    const backToSetupBtn = document.getElementById('backToSetup');
    const quizModeLabel = document.getElementById('quizModeLabel');
    const progressBarFill = document.getElementById('progressBarFill');
    const questionPosition = document.getElementById('questionPosition');
    const container = document.getElementById('questionContainer');
    const prevBtn = document.getElementById('prevQuestion');
    const nextBtn = document.getElementById('nextQuestion');

    const simulacroInfo = document.getElementById('simulacroInfo');
    const simAnswered = document.getElementById('simAnswered');
    const simTotal = document.getElementById('simTotal');
    const simCorrect = document.getElementById('simCorrect');
    const simIncorrect = document.getElementById('simIncorrect');
    const simBlank = document.getElementById('simBlank');
    const simFlagged = document.getElementById('simFlagged');
    const resetSimulacroBtn = document.getElementById('resetSimulacro');
    const simTimer = document.getElementById('simTimer');
    const simTimerText = document.getElementById('simTimerText');

    const finishSimulacroBtn = document.getElementById('finishSimulacroBtn');
    const bottomActionBar = document.getElementById('bottomActionBar');
    const continueInfoWrap = document.getElementById('continueInfoWrap');
    const continueBtn = document.getElementById('continueBtn');
    const continueInfoText = document.getElementById('continueInfoText');

    const openMapBtn = document.getElementById('openMapBtn');
    const answerMapModal = document.getElementById('answerMapModal');
    const closeAnswerMapBtn = document.getElementById('closeAnswerMapBtn');
    const closeAnswerMapFooterBtn = document.getElementById('closeAnswerMapFooterBtn');
    const answerMapGrid = document.getElementById('answerMapGrid');
    const answerMapSummary = document.getElementById('answerMapSummary');

    const goToQuestionInput = document.getElementById('goToQuestionInput');

    const resumeModal = document.getElementById('resumeModal');
    const resumeSummary = document.getElementById('resumeSummary');
    const resumeContinueBtn = document.getElementById('resumeContinueBtn');
    const discardResumeBtn = document.getElementById('discardResumeBtn');

    const finishModal = document.getElementById('finishModal');
    const closeFinishModalBtn = document.getElementById('closeFinishModalBtn');
    const cancelFinishBtn = document.getElementById('cancelFinishBtn');
    const confirmFinishBtn = document.getElementById('confirmFinishBtn');
    const finishAnswered = document.getElementById('finishAnswered');
    const finishTotal = document.getElementById('finishTotal');
    const finishWarning = document.getElementById('finishWarning');
    const finishStatAnswered = document.getElementById('finishStatAnswered');
    const finishStatFlagged = document.getElementById('finishStatFlagged');
    const finishStatBlank = document.getElementById('finishStatBlank');

    const continueModal = document.getElementById('continueModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const cancelModalBtn = document.getElementById('cancelModalBtn');
    const confirmModalBtn = document.getElementById('confirmModalBtn');
    const modalRemaining = document.getElementById('modalRemaining');
    const modalCountSelector = document.getElementById('modalCountSelector');
    const modalCustomCount = document.getElementById('modalCustomCount');
    const modalShuffle = document.getElementById('modalShuffle');
    const modalTimeBlock = document.getElementById('modalTimeBlock');
    const modalTimeInput = document.getElementById('modalTime');

    const timeUpModal = document.getElementById('timeUpModal');
    const timeUpAnswered = document.getElementById('timeUpAnswered');
    const timeUpTotal = document.getElementById('timeUpTotal');
    const confirmTimeUpBtn = document.getElementById('confirmTimeUpBtn');

    const resultsHeroIcon = document.getElementById('resultsHeroIcon');
    const resultsTitle = document.getElementById('resultsTitle');
    const resultsSubtitle = document.getElementById('resultsSubtitle');
    const scoreCircle = document.getElementById('scoreCircle');
    const resultsPercent = document.getElementById('resultsPercent');
    const resultsCorrect = document.getElementById('resultsCorrect');
    const resultsIncorrect = document.getElementById('resultsIncorrect');
    const resultsBlank = document.getElementById('resultsBlank');
    const resultsTime = document.getElementById('resultsTime');
    const resultsAvg = document.getElementById('resultsAvg');
    const resultsByArea = document.getElementById('resultsByArea');
    const resultsByEspecialidad = document.getElementById('resultsByEspecialidad');
    const reviewAnswersBtn = document.getElementById('reviewAnswersBtn');
    const backToSetupFromResults = document.getElementById('backToSetupFromResults');
    const retrySimulacroBtn = document.getElementById('retrySimulacroBtn');

    const backToResultsBtn = document.getElementById('backToResults');
    const reviewPosition = document.getElementById('reviewPosition');
    const reviewContainer = document.getElementById('reviewContainer');
    const reviewPrev = document.getElementById('reviewPrev');
    const reviewNext = document.getElementById('reviewNext');
    const reviewCounter = document.getElementById('reviewCounter');
    const reviewFilterBtns = document.querySelectorAll('.review-filter-btn');
    const progressBarFillReview = document.getElementById('progressBarFillReview');

    // ============================================================
    // 4. UTILIDADES
    // ============================================================
    function getLetras(pregunta) {
        return Object.keys(pregunta.opciones || {}).sort();
    }

    function shuffle(array) {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    /**
     * ID compuesto: "residencia:42", "enam:7", etc.
     * Lee el banco DESDE la pregunta (`_sourceId`), no desde `currentSource`.
     * Esto permite que en modo "Todos los bancos" cada pregunta siga
     * identificándose correctamente aunque haya números repetidos entre bancos.
     */
    function getPreguntaId(p) {
        const srcId = p._sourceId || (currentSource ? currentSource.id : 'default');
        return `${srcId}:${p.numero}`;
    }

    function getCantidadResolver() {
        const disponible = filteredIds.length;
        return selectedCount === 'all'
            ? disponible
            : Math.min(selectedCount, disponible);
    }

    function getAutoTimeLimit() {
        return getCantidadResolver();
    }

    function getEffectiveTimeLimitMin() {
        if (selectedTimeLimitMin != null && selectedTimeLimitMin > 0) {
            return selectedTimeLimitMin;
        }
        return getAutoTimeLimit();
    }

    function syncTimeInput() {
        if (!customTimeInput) return;
        const auto = getAutoTimeLimit();
        customTimeInput.placeholder = String(auto);
        if (selectedTimeLimitMin != null && selectedTimeLimitMin > 0) {
            customTimeInput.value = String(selectedTimeLimitMin);
        } else {
            customTimeInput.value = '';
        }
    }

    function getCantidadSugeridaModal() {
        const disponible = getRemainingIds().length;
        if (modalSelectedCount === 'all') return Math.max(disponible, 1);
        const n = parseInt(modalSelectedCount, 10);
        if (isNaN(n) || n < 1) return 1;
        return Math.max(Math.min(n, disponible), 1);
    }

    function getTiempoSugeridoModal() {
        return getCantidadSugeridaModal();
    }

    function syncModalTimeInput() {
        if (!modalTimeInput) return;
        modalTimeInput.placeholder = String(getTiempoSugeridoModal());
    }

    // ============================================================
    // 5. PERSISTENCIA (namespaced por banco)
    // ============================================================
    function getSimulacroStorageKey() {
        const id = currentSource ? currentSource.id : 'default';
        return `${STORAGE_KEY_SIMULACRO}_${id}`;
    }

    function saveSimulacroState() {
        if (currentMode !== MODE_SIMULACRO) return;
        if (simulacroState.revealed) return;
        if (sessionIds.length === 0) return;

        try {
            const snapshot = {
                version: 1,
                timestamp: Date.now(),
                sessionIds: [...sessionIds],
                currentIndex,
                answers: { ...simulacroState.answers },
                flagged: Array.from(simulacroState.flagged),
                startTime: simulacroState.startTime,
                timeLimit: simulacroState.timeLimit,
                elapsedPrevios: simulacroState.elapsedPrevios || 0,
                warnLevel: simulacroState.warnLevel,
                usedSessionIds: Array.from(usedSessionIds),
                filteredIds: [...filteredIds],
                selectedTimeLimitMin,
                selectedCount,
                enfoque: currentEnfoque,
                filters: {
                    area: filterArea.value,
                    especialidad: filterEspecialidad.value,
                    tema: filterTema.value,
                    dificultad: filterDificultad.value,
                    estado: filterEstado.value
                }
            };
            localStorage.setItem(getSimulacroStorageKey(), JSON.stringify(snapshot));
        } catch (err) {
            console.warn('No se pudo guardar el simulacro:', err);
        }
    }

    function loadSavedSimulacroState() {
        let raw;
        try {
            raw = localStorage.getItem(getSimulacroStorageKey());
        } catch (err) {
            return null;
        }
        if (!raw) return null;

        let data;
        try {
            data = JSON.parse(raw);
        } catch (err) {
            console.warn('Simulacro guardado corrupto, se descarta.');
            clearSavedSimulacroState();
            return null;
        }

        if (!data || data.version !== 1) {
            clearSavedSimulacroState();
            return null;
        }
        if (!Array.isArray(data.sessionIds) || data.sessionIds.length === 0) {
            clearSavedSimulacroState();
            return null;
        }
        if (!data.timestamp || (Date.now() - data.timestamp) > STORAGE_MAX_AGE_MS) {
            console.info('Simulacro guardado caducó.');
            clearSavedSimulacroState();
            return null;
        }
        const valid = data.sessionIds.every(id => typeof id === 'number' && id >= 0 && id < preguntas.length);
        if (!valid) {
            clearSavedSimulacroState();
            return null;
        }

        return data;
    }

    function clearSavedSimulacroState() {
        try {
            localStorage.removeItem(getSimulacroStorageKey());
        } catch (err) { /* noop */ }
    }

    function showResumeModal(data) {
        pendingResumeData = data;

        const total = data.sessionIds.length;
        const answered = Object.keys(data.answers).length;
        const flagged = data.flagged.length;
        const blank = total - answered;

        let timeInfo = 'Sin límite';
        if (data.timeLimit && data.startTime) {
            const elapsed = Math.floor((Date.now() - data.startTime) / 1000);
            const remaining = Math.max(0, data.timeLimit - elapsed);
            timeInfo = remaining > 0 ? formatTime(remaining) + ' restantes' : 'Agotado';
        }

        const fecha = new Date(data.timestamp);
        const fechaTxt = fecha.toLocaleString('es-PE', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

        resumeSummary.innerHTML = `
            <div class="resume-stats">
                <div class="resume-stat">
                    <span class="resume-stat-label">Total</span>
                    <span class="resume-stat-value">${total}</span>
                </div>
                <div class="resume-stat">
                    <span class="resume-stat-label">Respondidas</span>
                    <span class="resume-stat-value resume-ok">${answered}</span>
                </div>
                <div class="resume-stat">
                    <span class="resume-stat-label">Marcadas</span>
                    <span class="resume-stat-value resume-warn">${flagged}</span>
                </div>
                <div class="resume-stat">
                    <span class="resume-stat-label">En blanco</span>
                    <span class="resume-stat-value">${blank}</span>
                </div>
            </div>
            <div class="resume-meta">
                <div class="resume-meta-line"><span>Tiempo restante</span><strong>${timeInfo}</strong></div>
                <div class="resume-meta-line"><span>Guardado</span><strong>${fechaTxt}</strong></div>
            </div>
        `;

        resumeModal.style.display = 'flex';
    }

    function hideResumeModal() {
        resumeModal.style.display = 'none';
    }

    function resumeSimulacroFromStorage() {
        const data = pendingResumeData;
        if (!data) {
            hideResumeModal();
            return;
        }

        sessionIds = [...data.sessionIds];
        currentIndex = Math.min(Math.max(0, data.currentIndex || 0), sessionIds.length - 1);
        currentMode = MODE_SIMULACRO;

        usedSessionIds = new Set(data.usedSessionIds || sessionIds);
        filteredIds = Array.isArray(data.filteredIds) && data.filteredIds.length > 0
            ? [...data.filteredIds]
            : [...sessionIds];

        simulacroState = {
            answers: { ...(data.answers || {}) },
            flagged: new Set(data.flagged || []),
            revealed: false,
            startTime: data.startTime || Date.now(),
            endTime: null,
            timeLimit: data.timeLimit || null,
            remaining: null,
            elapsedPrevios: data.elapsedPrevios || 0,
            timeUp: false,
            warnLevel: data.warnLevel || 0
        };

        selectedTimeLimitMin = (data.selectedTimeLimitMin != null && data.selectedTimeLimitMin > 0)
            ? data.selectedTimeLimitMin
            : null;

        if (data.selectedCount != null) {
            selectedCount = data.selectedCount;
        }
        if (data.enfoque) {
            currentEnfoque = data.enfoque;
            enfoqueBtns.forEach(b => {
                b.classList.toggle('active', b.dataset.enfoque === currentEnfoque);
            });
        }

        if (data.filters) {
            filterArea.value = data.filters.area || 'all';
            updateDependentFilters();
            filterEspecialidad.value = data.filters.especialidad || 'all';
            updateDependentFilters();
            filterTema.value = data.filters.tema || 'all';
            filterDificultad.value = data.filters.dificultad || 'all';
            filterEstado.value = data.filters.estado || 'all';
        }

        setupModePractice.classList.remove('active');
        setupModeSimulacro.classList.add('active');
        modeHelp.textContent = 'En simulacro, respondes todas las preguntas y ves resultados al finalizar (estilo CONAREME).';

        updateSetupSummary();
        updatePerfilResumen();

        showScreen('quiz');
        updateQuizModeLabel();
        updateQuizInfoPanel();

        if (simulacroState.timeLimit) {
            const elapsed = Math.floor((Date.now() - simulacroState.startTime) / 1000);
            const remaining = simulacroState.timeLimit - elapsed;
            if (remaining <= 0) {
                simulacroState.revealed = true;
                simulacroState.timeUp = true;
                simulacroState.endTime = Date.now();
                hideResumeModal();
                clearSavedSimulacroState();
                showResults();
                return;
            }
            startSimTimer();
        } else {
            stopSimTimer();
        }

        renderPage();

        hideResumeModal();
        clearSavedSimulacroState();
        pendingResumeData = null;
    }

    function discardSavedSimulacro() {
        clearSavedSimulacroState();
        pendingResumeData = null;
        hideResumeModal();
    }

    // ============================================================
    // 6. CARGA DE DATOS (multi-banco)
    // ============================================================
    function getSavedSourceId() {
        try { return localStorage.getItem(STORAGE_KEY_SOURCE); }
        catch (err) { return null; }
    }

    function saveSourceId(id) {
        try { localStorage.setItem(STORAGE_KEY_SOURCE, id); }
        catch (err) { /* noop */ }
    }

    function populateSourceFilter() {
        if (!filterSource) return;
        filterSource.innerHTML = '';

        // Opción "Todos" (primera, como en los demás filtros)
        const allOpt = document.createElement('option');
        allOpt.value = SOURCE_ALL_ID;
        allOpt.textContent = 'Todos';
        filterSource.appendChild(allOpt);

        dataSources.forEach(src => {
            const opt = document.createElement('option');
            opt.value = src.id;
            opt.textContent = src.name;
            filterSource.appendChild(opt);
        });
    }

    function loadSourcesManifest() {
        fetch(SOURCES_URL)
            .then(r => {
                if (!r.ok) throw new Error(`No se pudo cargar ${SOURCES_URL}`);
                return r.json();
            })
            .then(list => {
                if (!Array.isArray(list) || list.length === 0) {
                    throw new Error('El manifiesto de fuentes está vacío.');
                }
                dataSources = list;
                populateSourceFilter();

                const savedId = getSavedSourceId();
                let initial;
                if (savedId === SOURCE_ALL_ID) {
                    initial = { id: SOURCE_ALL_ID, name: 'Todos', file: null };
                } else {
                    initial = dataSources.find(s => s.id === savedId) || dataSources[0];
                }
                return loadSource(initial);
            })
            .catch(err => {
                console.error('Error al cargar el manifiesto:', err);
                if (filterSource) {
                    filterSource.innerHTML = '<option value="">Error de carga</option>';
                }
                container.innerHTML = `
                    <div style="padding:40px;text-align:center;color:#991b1b;background:#fef2f2;border-radius:14px;border:1px solid #fecaca;">
                        <h3 style="color:#991b1b;">Error al cargar los bancos</h3>
                        <p style="margin-top:8px;">Verifica que exista <strong>${SOURCES_URL}</strong> y que sea un JSON válido.</p>
                        <p style="font-size:13px;color:#6b7280;margin-top:4px;">${err.message}</p>
                    </div>
                `;
            });
    }

    function resetSessionState() {
        preguntas = [];
        filteredIds = [];
        sessionIds = [];
        currentIndex = 0;
        practiceAnswers = {};
        practiceFeedback = {};
        practiceRevealed = {};
        usedSessionIds = new Set();
        simulacroState = {
            answers: {}, flagged: new Set(), revealed: false,
            startTime: null, endTime: null, timeLimit: null,
            remaining: null, elapsedPrevios: 0, timeUp: false, warnLevel: 0
        };
    }

    function loadSource(source) {
        if (!source) return Promise.resolve();

        // Modo "Todos"
        if (source.id === SOURCE_ALL_ID) {
            return loadAllSources();
        }

        if (!source.file) return Promise.resolve();

        // Cerrar modales previos y detener cualquier timer
        hideResumeModal();
        stopSimTimer();

        currentSource = source;
        saveSourceId(source.id);
        if (filterSource) filterSource.value = source.id;

        resetSessionState();

        return fetch(source.file)
            .then(r => {
                if (!r.ok) throw new Error(`No se pudo cargar ${source.file}`);
                return r.json();
            })
            .then(data => {
                // Etiquetar cada pregunta con su banco de origen
                preguntas = data.map(p => ({ ...p, _sourceId: source.id }));

                console.log(`✅ ${preguntas.length} preguntas cargadas desde ${source.file}`);
                totalSpan.textContent = preguntas.length;
                populateAllFilters();
                updatePerfilResumen();
                applyFilters();

                const saved = loadSavedSimulacroState();
                if (saved) {
                    showResumeModal(saved);
                }
            })
            .catch(err => {
                console.error('Error al cargar los datos:', err);
                container.innerHTML = `
                    <div style="padding:40px;text-align:center;color:#991b1b;background:#fef2f2;border-radius:14px;border:1px solid #fecaca;">
                        <h3 style="color:#991b1b;">Error al cargar ${source.file}</h3>
                        <p style="font-size:13px;color:#6b7280;margin-top:4px;">${err.message}</p>
                    </div>
                `;
            });
    }

    function loadAllSources() {
        hideResumeModal();
        stopSimTimer();

        currentSource = { id: SOURCE_ALL_ID, name: 'Todos los bancos', file: null };
        saveSourceId(SOURCE_ALL_ID);
        if (filterSource) filterSource.value = SOURCE_ALL_ID;

        resetSessionState();

        // Cargar todos los bancos en paralelo sin abortar si uno falla
        const tasks = dataSources.map(src =>
            fetch(src.file)
                .then(r => {
                    if (!r.ok) throw new Error(`No se pudo cargar ${src.file}`);
                    return r.json();
                })
                .then(data => ({ src, data, ok: true }))
                .catch(err => ({ src, error: err, ok: false }))
        );

        return Promise.all(tasks).then(results => {
            const exitosos = [];
            const fallidos = [];

            results.forEach(res => {
                if (res.ok && Array.isArray(res.data)) {
                    const tagged = res.data.map(p => ({ ...p, _sourceId: res.src.id }));
                    preguntas = preguntas.concat(tagged);
                    exitosos.push({ name: res.src.name, count: tagged.length });
                } else {
                    fallidos.push(res.src.name);
                    console.warn(`[Multi-banco] Falló ${res.src.name}:`, res.error);
                }
            });

            console.log(`✅ ${preguntas.length} preguntas cargadas de ${exitosos.length} banco(s).`);
            if (fallidos.length) {
                console.warn(`⚠️ Bancos con error: ${fallidos.join(', ')}`);
            }

            totalSpan.textContent = preguntas.length;
            populateAllFilters();
            updatePerfilResumen();
            applyFilters();

            const saved = loadSavedSimulacroState();
            if (saved) {
                showResumeModal(saved);
            }
        });
    }

    // ============================================================
    // 7. FILTROS
    // ============================================================
    function populateAllFilters() {
        const areas = getUniqueValues('area');
        const especialidades = getUniqueValues('especialidad');
        const temas = getUniqueValues('tema');

        populateSelect(filterArea, areas, 'Todas');
        populateSelect(filterEspecialidad, especialidades, 'Todas');
        populateSelect(filterTema, temas, 'Todos');
    }

    function getUniqueValues(campo, fuente = preguntas) {
        return [...new Set(fuente.map(p => p[campo]))].sort();
    }

    function populateSelect(select, items, placeholder) {
        select.innerHTML = `<option value="all">${placeholder}</option>`;
        items.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item;
            opt.textContent = item;
            select.appendChild(opt);
        });
    }

    function updateDependentFilters() {
        const areaSeleccionada = filterArea.value;
        const espActual = filterEspecialidad.value;
        const temaActual = filterTema.value;

        const especialidadesDisponibles = getEspecialidadesDisponibles(areaSeleccionada);
        rebuildFilterSelect(filterEspecialidad, especialidadesDisponibles, 'Todas', espActual);

        const espFinal = filterEspecialidad.value;
        const temasDisponibles = getTemasDisponibles(areaSeleccionada, espFinal);
        rebuildFilterSelect(filterTema, temasDisponibles, 'Todos', temaActual);
    }

    function getEspecialidadesDisponibles(area) {
        if (area === 'all') return getUniqueValues('especialidad');
        return getUniqueValues('especialidad', preguntas.filter(p => p.area === area));
    }

    function getTemasDisponibles(area, especialidad) {
        const sinArea = area === 'all';
        const sinEsp = especialidad === 'all';

        if (sinArea && sinEsp) return getUniqueValues('tema');
        if (!sinArea && sinEsp) return getUniqueValues('tema', preguntas.filter(p => p.area === area));
        if (sinArea && !sinEsp) return getUniqueValues('tema', preguntas.filter(p => p.especialidad === especialidad));
        return getUniqueValues('tema', preguntas.filter(p => p.area === area && p.especialidad === especialidad));
    }

    function rebuildFilterSelect(select, opciones, placeholder, seleccionPrevia) {
        select.innerHTML = `<option value="all">${placeholder}</option>`;
        opciones.forEach(op => {
            const opt = document.createElement('option');
            opt.value = op;
            opt.textContent = op;
            select.appendChild(opt);
        });

        if (opciones.includes(seleccionPrevia) && seleccionPrevia !== 'all') {
            select.value = seleccionPrevia;
        } else {
            select.value = 'all';
        }
    }

    function cumpleEnfoque(p) {
        if (currentEnfoque === 'all') return true;

        const id = getPreguntaId(p);
        const estado = window.Dominio ? window.Dominio.getEstado(id) : null;

        if (currentEnfoque === 'no-dominadas') {
            return estado !== 'dominada';
        }
        if (currentEnfoque === 'falladas') {
            return estado === 'fallada';
        }
        if (currentEnfoque === 'dudosas') {
            return estado === 'dudosa';
        }
        return true;
    }

    function pesoEnfoque(p) {
        if (!window.Dominio) return 0;
        const id = getPreguntaId(p);
        const info = window.Dominio.getInfo(id);
        if (!info) return 0;
        return (info.fallos || 0) * 1000 + (info.dudas || 0) * 10;
    }

    function applyFilters() {
        const filtros = {
            area: filterArea.value,
            especialidad: filterEspecialidad.value,
            tema: filterTema.value,
            dificultad: filterDificultad.value,
            estado: filterEstado.value
        };

        let candidatas = preguntas
            .map((p, idx) => ({ ...p, idx }))
            .filter(p => cumpleFiltros(p, filtros))
            .filter(p => cumpleEnfoque(p));

        if (currentEnfoque !== 'all') {
            candidatas.sort((a, b) => pesoEnfoque(b) - pesoEnfoque(a));
        }

        filteredIds = candidatas.map(p => p.idx);

        updateSetupSummary();
    }

    function cumpleFiltros(pregunta, filtros) {
        for (const [campo, valor] of Object.entries(filtros)) {
            if (valor !== 'all' && pregunta[campo] !== valor) return false;
        }
        return true;
    }

    // ============================================================
    // 8. SETUP
    // ============================================================
    function updateSetupSummary() {
        const disponible = filteredIds.length;
        const aResolver = getCantidadResolver();

        summaryMode.textContent = currentMode === MODE_PRACTICE ? 'Práctica' : 'Simulacro';
        summaryFilters.textContent = buildFilterLabel();
        summaryAvailable.textContent = disponible;
        summaryCount.textContent = aResolver;

        const esSimulacro = currentMode === MODE_SIMULACRO;
        if (timeBlock) {
            timeBlock.style.display = esSimulacro ? 'block' : 'none';
        }

        const minutosEfectivos = getEffectiveTimeLimitMin();
        summaryTimeLine.style.display = (esSimulacro && minutosEfectivos > 0) ? 'flex' : 'none';
        if (esSimulacro && minutosEfectivos > 0) {
            summaryTime.textContent = `${minutosEfectivos} min`;
        }

        startSessionBtn.disabled = disponible === 0;

        syncTimeInput();
    }

    function buildFilterLabel() {
        const activos = [];
        if (currentSource && currentSource.name) activos.push(currentSource.name);
        if (filterArea.value !== 'all') activos.push(filterArea.value);
        if (filterEspecialidad.value !== 'all') activos.push(filterEspecialidad.value);
        if (filterTema.value !== 'all') activos.push(filterTema.value);
        if (filterDificultad.value !== 'all') activos.push(filterDificultad.value);
        if (filterEstado.value !== 'all') activos.push(filterEstado.value);

        const mapEnfoque = {
            'all': null,
            'no-dominadas': 'No dominadas',
            'falladas': 'Solo falladas',
            'dudosas': 'Solo dudosas'
        };
        const enfTxt = mapEnfoque[currentEnfoque];
        if (enfTxt) activos.push(enfTxt);

        return activos.length ? activos.join(' · ') : 'Todas';
    }

    function updatePerfilResumen() {
        if (!perfilResumen) return;
        if (!window.Dominio) {
            perfilResumen.textContent = '';
            return;
        }

        // En modo "Todos los bancos" → resumen global (sin prefijo).
        // En banco individual → sólo ese banco (prefijo "residencia:").
        let r;
        if (!currentSource || currentSource.id === SOURCE_ALL_ID) {
            r = window.Dominio.getResumen();
        } else {
            r = window.Dominio.getResumen(currentSource.id + ':');
        }

        if (r.total === 0) {
            perfilResumen.innerHTML = `<span class="perfil-vacio">Aún no hay datos para este banco. Empieza a practicar para construir tu perfil.</span>`;
            return;
        }
        perfilResumen.innerHTML = `
            <span class="perfil-chip perfil-dominada">${r.dominadas} dominadas</span>
            <span class="perfil-chip perfil-dudosa">${r.dudosas} dudosas</span>
            <span class="perfil-chip perfil-fallada">${r.falladas} falladas</span>
            <span class="perfil-chip perfil-total">Total: ${r.total}</span>
        `;
    }

    function startSession() {
        if (filteredIds.length === 0) return;

        let base = [...filteredIds];
        if (shuffleCheckbox.checked) base = shuffle(base);

        const cantidad = selectedCount === 'all'
            ? base.length
            : Math.min(selectedCount, base.length);

        sessionIds = base.slice(0, cantidad);
        usedSessionIds = new Set(sessionIds);

        currentIndex = 0;
        practiceAnswers = {};
        practiceFeedback = {};
        practiceRevealed = {};

        const minutosEfectivos = getEffectiveTimeLimitMin();
        const timeLimitSec = (currentMode === MODE_SIMULACRO && minutosEfectivos > 0)
            ? minutosEfectivos * 60
            : null;

        simulacroState = {
            answers: {},
            flagged: new Set(),
            revealed: false,
            startTime: Date.now(),
            endTime: null,
            timeLimit: timeLimitSec,
            remaining: timeLimitSec,
            elapsedPrevios: 0,
            timeUp: false,
            warnLevel: 0
        };

        reviewFilter = 'all';
        reviewIds = [];
        reviewIndex = 0;

        showScreen('quiz');
        updateQuizModeLabel();
        updateQuizInfoPanel();

        if (currentMode === MODE_SIMULACRO) {
            startSimTimer();
            saveSimulacroState();
        } else {
            stopSimTimer();
        }

        renderPage();
    }

    // ============================================================
    // 9. NAVEGACIÓN ENTRE PANTALLAS
    // ============================================================
    function showScreen(name) {
        body.classList.remove('view-setup', 'view-quiz', 'view-results', 'view-review');
        body.classList.add('view-' + name);

        [screenSetup, screenQuiz, screenResults, screenReview].forEach(s => {
            if (s) s.classList.remove('active');
        });

        if (name === 'setup') {
            screenSetup.classList.add('active');
            if (bottomActionBar) bottomActionBar.style.display = 'none';
            stopSimTimer();
        } else if (name === 'quiz') {
            screenQuiz.classList.add('active');
        } else if (name === 'results') {
            screenResults.classList.add('active');
            stopSimTimer();
        } else if (name === 'review') {
            screenReview.classList.add('active');
        }
    }

    function volverAlSetup() {
        showScreen('setup');
        applyFilters();
        updatePerfilResumen();
        updateSetupSummary();
    }

    function actualizarBottomActionBar() {
        if (!bottomActionBar) return;
        const hayFinalizar = finishSimulacroBtn && finishSimulacroBtn.style.display !== 'none';
        const hayContinuar = continueBtn && continueBtn.style.display !== 'none';
        const mostrar = hayFinalizar || hayContinuar;
        bottomActionBar.style.display = mostrar ? 'flex' : 'none';
        if (continueInfoWrap) {
            continueInfoWrap.style.display = hayContinuar ? 'block' : 'none';
        }
    }

    function updateQuizModeLabel() {
        quizModeLabel.textContent = currentMode === MODE_PRACTICE ? 'Práctica' : 'Simulacro';

        simulacroInfo.style.display = 'flex';
        simulacroInfo.classList.toggle('mode-practice', currentMode === MODE_PRACTICE);
        simulacroInfo.classList.toggle('mode-simulacro', currentMode === MODE_SIMULACRO);

        resetSimulacroBtn.style.display = currentMode === MODE_SIMULACRO ? 'inline-flex' : 'none';
        simTimer.style.display = currentMode === MODE_SIMULACRO ? 'inline-flex' : 'none';

        const mostrarFinalizar = (currentMode === MODE_SIMULACRO) && !simulacroState.revealed;
        if (finishSimulacroBtn) {
            finishSimulacroBtn.style.display = mostrarFinalizar ? 'inline-flex' : 'none';
        }

        actualizarBottomActionBar();
    }

    function goBackToSetup() {
        const hayProgreso =
            Object.keys(simulacroState.answers).length > 0 ||
            Object.keys(practiceRevealed).length > 0;

        if (hayProgreso) {
            const msg = currentMode === MODE_SIMULACRO
                ? '¿Volver a la configuración? Se perderá el progreso del simulacro (no se podrá retomar).'
                : '¿Volver a la configuración? Se perderá el progreso de esta sesión.';

            if (!confirm(msg)) return;
        }

        if (currentMode === MODE_SIMULACRO) {
            clearSavedSimulacroState();
        }

        stopSimTimer();
        volverAlSetup();
    }

    // ============================================================
    // 10. TEMPORIZADOR
    // ============================================================
    let simTimerInterval = null;

    function startSimTimer() {
        stopSimTimer();
        if (!simulacroState.startTime) simulacroState.startTime = Date.now();
        updateSimTimerDisplay();
        simTimerInterval = setInterval(updateSimTimerDisplay, 1000);
    }

    function stopSimTimer() {
        if (simTimerInterval) {
            clearInterval(simTimerInterval);
            simTimerInterval = null;
        }
    }

    function updateSimTimerDisplay() {
        const target = simTimerText || simTimer;
        if (!simulacroState.startTime) {
            if (target) target.textContent = '00:00';
            return;
        }

        const elapsed = Math.floor((Date.now() - simulacroState.startTime) / 1000);

        if (!simulacroState.timeLimit) {
            simTimer.classList.remove('warning', 'danger');
            if (target) target.textContent = formatTime(elapsed);
            return;
        }

        const remaining = Math.max(0, simulacroState.timeLimit - elapsed);
        simulacroState.remaining = remaining;

        simTimer.classList.toggle('warning', remaining <= WARN_THRESHOLD_2 && remaining > WARN_THRESHOLD_3);
        simTimer.classList.toggle('danger', remaining <= WARN_THRESHOLD_3);

        if (target) target.textContent = `${formatTime(remaining)} restantes`;

        let nuevoNivel = 0;
        if (remaining <= WARN_THRESHOLD_3) nuevoNivel = 3;
        else if (remaining <= WARN_THRESHOLD_2) nuevoNivel = 2;
        else if (remaining <= WARN_THRESHOLD_1) nuevoNivel = 1;

        if (nuevoNivel > simulacroState.warnLevel) {
            simulacroState.warnLevel = nuevoNivel;
        }

        if (remaining === 0) {
            stopSimTimer();
            handleTimeUp();
        }
    }

    function handleTimeUp() {
        simulacroState.timeUp = true;
        simulacroState.revealed = true;
        simulacroState.endTime = Date.now();

        clearSavedSimulacroState();
        registrarDominioSimulacro();

        const s = computeSimulacroStats();
        timeUpAnswered.textContent = s.answered;
        timeUpTotal.textContent = s.total;

        timeUpModal.style.display = 'flex';
    }

    function confirmTimeUp() {
        timeUpModal.style.display = 'none';
        showResults();
    }

    // ============================================================
    // 11. CONTINUAR CON MÁS PREGUNTAS
    // ============================================================
    function getRemainingIds() {
        return filteredIds.filter(id => !usedSessionIds.has(id));
    }

    function updateContinueBar() {
        if (!continueBtn) return;

        if (sessionIds.length === 0) {
            continueBtn.style.display = 'none';
            actualizarBottomActionBar();
            return;
        }

        const isLast = currentIndex === sessionIds.length - 1;
        const remaining = getRemainingIds().length;

        if (currentMode === MODE_SIMULACRO && simulacroState.revealed) {
            continueBtn.style.display = 'none';
            actualizarBottomActionBar();
            return;
        }

        const lastIdx = sessionIds[currentIndex];
        const lastAnswered = (currentMode === MODE_PRACTICE)
            ? !!practiceRevealed[lastIdx]
            : !!simulacroState.answers[lastIdx];

        if (isLast && lastAnswered && remaining > 0) {
            continueBtn.style.display = 'inline-flex';
            continueInfoText.textContent =
                `Has llegado al final del bloque. Quedan ${remaining} preguntas disponibles.`;
        } else {
            continueBtn.style.display = 'none';
        }

        actualizarBottomActionBar();
    }

    function openContinueModal() {
        applyFilters();

        const remaining = getRemainingIds().length;
        if (remaining === 0) return;

        modalRemaining.textContent = remaining;
        modalSelectedCount = Math.min(10, remaining);

        Array.from(modalCountSelector.querySelectorAll('.count-btn')).forEach(btn => {
            btn.classList.remove('active');
            const val = btn.dataset.count;
            if (val !== 'all' && parseInt(val, 10) === modalSelectedCount) {
                btn.classList.add('active');
            }
        });

        if (!modalCountSelector.querySelector('.count-btn.active')) {
            const allBtn = modalCountSelector.querySelector('.count-btn[data-count="all"]');
            if (allBtn) allBtn.classList.add('active');
            modalSelectedCount = remaining;
        }

        modalCustomCount.value = '';
        modalShuffle.checked = true;

        const esSimulacro = (currentMode === MODE_SIMULACRO);
        if (modalTimeBlock) {
            modalTimeBlock.style.display = esSimulacro ? 'block' : 'none';
        }

        if (esSimulacro && modalTimeInput) {
            modalTimeInput.value = '';
            modalTimeInput.placeholder = String(getTiempoSugeridoModal());
        }

        continueModal.style.display = 'flex';
    }

    function closeContinueModal() {
        continueModal.style.display = 'none';
    }

    function addMoreQuestions() {
        applyFilters();

        const remainingIds = getRemainingIds();
        if (remainingIds.length === 0) {
            closeContinueModal();
            return;
        }

        let cantidad = modalSelectedCount === 'all'
            ? remainingIds.length
            : Math.min(modalSelectedCount, remainingIds.length);

        if (cantidad <= 0) return;

        let nuevas = [...remainingIds];
        if (modalShuffle.checked) nuevas = shuffle(nuevas);
        nuevas = nuevas.slice(0, cantidad);

        const esSimulacro = (currentMode === MODE_SIMULACRO);
        let minutosNuevos = null;

        if (esSimulacro && modalTimeInput) {
            const raw = (modalTimeInput.value || '').trim();
            if (raw === '') {
                const ph = parseInt(modalTimeInput.placeholder, 10);
                minutosNuevos = (!isNaN(ph) && ph > 0) ? ph : cantidad;
            } else {
                const v = parseInt(raw, 10);
                minutosNuevos = (!isNaN(v) && v > 0) ? v : cantidad;
            }
        }

        if (esSimulacro && minutosNuevos != null && !simulacroState.revealed) {
            if (simulacroState.startTime) {
                const elapsedBloque = Math.max(
                    0,
                    Math.floor((Date.now() - simulacroState.startTime) / 1000)
                );
                simulacroState.elapsedPrevios =
                    (simulacroState.elapsedPrevios || 0) + elapsedBloque;
            }

            simulacroState.startTime = Date.now();
            simulacroState.timeLimit = minutosNuevos * 60;
            simulacroState.remaining = simulacroState.timeLimit;
            simulacroState.warnLevel = 0;

            startSimTimer();
        }

        sessionIds = sessionIds.concat(nuevas);
        nuevas.forEach(id => usedSessionIds.add(id));

        closeContinueModal();

        currentIndex = sessionIds.length - nuevas.length;
        renderPage();
        updateQuizInfoPanel();
        saveSimulacroState();
    }

    // ============================================================
    // 12. RENDERIZADO DEL CUESTIONARIO
    // ============================================================
    function renderPage() {
        if (sessionIds.length === 0) {
            container.innerHTML = `<p style="padding:40px;text-align:center;color:var(--text-tertiary);">No hay preguntas para mostrar.</p>`;
            updateNavigation();
            return;
        }

        if (currentIndex < 0) currentIndex = 0;
        if (currentIndex >= sessionIds.length) currentIndex = sessionIds.length - 1;

        const idx = sessionIds[currentIndex];
        const p = preguntas[idx];

        container.innerHTML = (currentMode === MODE_PRACTICE)
            ? buildPracticeCard(p, idx)
            : buildSimulacroCard(p, idx);

        updateNavigation();
    }

    function buildQuestionHeader(p, mostrarTags = true, idx = null) {
        // En modo "Todos los bancos" mostramos un tag extra con el banco de origen
        const mostrarTagBanco = mostrarTags && currentSource && currentSource.id === SOURCE_ALL_ID && p._sourceId;

        const tagsHtml = mostrarTags ? `
            <div class="question-tags">
                ${mostrarTagBanco ? `<span class="tag tag-source">${p._sourceId}</span>` : ''}
                <span class="tag">${p.area}</span>
                <span class="tag">${p.especialidad}</span>
                <span class="tag">${p.tema}</span>
                <span class="tag dificultad-${p.dificultad}">${p.dificultad}</span>
                <span class="tag estado-${p.estado}">${p.estado}</span>
            </div>
        ` : '';

        const copyBtnHtml = (idx !== null && idx !== undefined) ? `
            <button
                type="button"
                class="copy-btn"
                onclick="window.copyQuestion(${idx}, this)"
                title="Copiar enunciado y alternativas"
                aria-label="Copiar enunciado y alternativas"
            >
                ${ICONS.copy}
            </button>
        ` : '';

        return `
            <div class="question-header">
                <span class="question-number">#${p.numero}</span>
                <div class="question-header-right">
                    ${tagsHtml}
                    ${copyBtnHtml}
                </div>
            </div>
        `;
    }

    function buildPracticeCard(p, idx) {
        const isRevealed = practiceRevealed[idx] || false;
        const selected = practiceAnswers[idx] || '';
        const feedback = practiceFeedback[idx] || '';
        const letras = getLetras(p);

        const opcionesHtml = letras.map(letra => {
            const texto = p.opciones[letra] || '';
            let classes = 'option-item';
            if (isRevealed) {
                classes += ' disabled';
                if (letra === p.respuesta) classes += ' correct';
                if (letra === selected && letra !== p.respuesta) classes += ' wrong';
            } else {
                classes += ' clickable';
            }
            const onclick = isRevealed
                ? ''
                : `onclick="window.handlePracticeAnswer(${idx}, '${letra}')"`;

            return `
                <div class="${classes}" ${onclick}>
                    <span class="letter">${letra}</span>
                    <span class="option-text">${texto}</span>
                </div>
            `;
        }).join('');

        let cardClass = 'question-card';
        if (isRevealed) {
            cardClass += feedback === 'correct' ? ' correct-answered' : ' wrong-answered';
        }

        const feedbackHtml = isRevealed
            ? `<div class="feedback ${feedback}">
                   ${feedback === 'correct'
                       ? `${ICONS.check} ¡Correcto!`
                       : `${ICONS.x} Incorrecto. La respuesta correcta era ${p.respuesta}`}
               </div>`
            : '';

        const explanationHtml = isRevealed
            ? `<div class="explanation"><strong>${ICONS.bulb} Explicación:</strong> ${p.explicacion}</div>`
            : '';

        return `
            <div class="${cardClass}">
                ${buildQuestionHeader(p, true, idx)}
                <div class="question-text">${p.enunciado}</div>
                <div class="options-list">${opcionesHtml}</div>
                ${feedbackHtml}
                ${explanationHtml}
            </div>
        `;
    }

    function buildSimulacroCard(p, idx) {
        const selected = simulacroState.answers[idx] || '';
        const isFlagged = simulacroState.flagged.has(idx);
        const letras = getLetras(p);

        const opcionesHtml = letras.map(letra => {
            const texto = p.opciones[letra] || '';
            let classes = 'option-item clickable';
            if (letra === selected) classes += ' selected';

            const onclick = `onclick="window.handleSimulacroAnswer(${idx}, '${letra}')"`;

            return `
                <div class="${classes}" ${onclick}>
                    <span class="letter">${letra}</span>
                    <span class="option-text">${texto}</span>
                </div>
            `;
        }).join('');

        const flagBtnHtml = `
            <button
                class="flag-btn ${isFlagged ? 'flagged' : ''}"
                onclick="window.toggleFlag(${idx})"
                title="${isFlagged ? 'Quitar marca' : 'Marcar para revisar'} (M)"
            >
                ${ICONS.flag}
                ${isFlagged ? 'Marcada' : 'Marcar'}
            </button>
        `;

        return `
            <div class="question-card">
                ${buildQuestionHeader(p, false, idx)}
                <div class="question-text">${p.enunciado}</div>
                <div class="options-list">${opcionesHtml}</div>
                <div class="sim-card-actions">
                    ${flagBtnHtml}
                </div>
            </div>
        `;
    }

    function updateNavigation() {
        const total = sessionIds.length;
        const pos = total === 0 ? 0 : currentIndex + 1;

        questionPosition.textContent = `${pos} / ${total}`;
        prevBtn.disabled = currentIndex <= 0;
        nextBtn.disabled = currentIndex >= total - 1;

        const pct = total === 0 ? 0 : ((currentIndex + 1) / total) * 100;
        progressBarFill.style.width = `${pct}%`;

        updateContinueBar();
    }

    // ============================================================
    // 13. HANDLERS DE RESPUESTA
    // ============================================================
    window.handlePracticeAnswer = function (idx, answer) {
        if (practiceRevealed[idx]) return;
        const p = preguntas[idx];
        practiceAnswers[idx] = answer;
        practiceRevealed[idx] = true;
        const acierto = (answer === p.respuesta);
        practiceFeedback[idx] = acierto ? 'correct' : 'wrong';

        if (window.Dominio) {
            window.Dominio.registrarIntento(getPreguntaId(p), acierto, false);
        }

        renderPage();
        updateQuizInfoPanel();
        updatePerfilResumen();
    };

    window.handleSimulacroAnswer = function (idx, answer) {
        if (simulacroState.revealed) return;
        simulacroState.answers[idx] = answer;
        renderPage();
        updateQuizInfoPanel();
        saveSimulacroState();
    };

    window.toggleFlag = function (idx) {
        if (currentMode !== MODE_SIMULACRO) return;
        if (simulacroState.flagged.has(idx)) {
            simulacroState.flagged.delete(idx);
        } else {
            simulacroState.flagged.add(idx);
        }
        renderPage();
        updateQuizInfoPanel();
        saveSimulacroState();
    };

    window.marcarYaEntiendo = function (idx) {
        const p = preguntas[idx];
        if (window.Dominio) {
            window.Dominio.marcarDudosa(getPreguntaId(p));
        }
        renderReviewPage();
        updatePerfilResumen();
    };

    window.marcarAunDudo = function (idx) {
        const p = preguntas[idx];
        if (window.Dominio) {
            window.Dominio.registrarIntento(getPreguntaId(p), false, true);
        }
        renderReviewPage();
        updatePerfilResumen();
    };

    // ------------------------------------------------------------
    // COPIAR ENUNCIADO + ALTERNATIVAS AL PORTAPAPELES
    // ------------------------------------------------------------
    function buildQuestionPlainText(p) {
        const letras = getLetras(p);
        const lineas = [];

        lineas.push(`#${p.numero}`);
        lineas.push('');
        lineas.push(String(p.enunciado || '').trim());
        lineas.push('');

        letras.forEach(letra => {
            const texto = (p.opciones && p.opciones[letra]) ? String(p.opciones[letra]).trim() : '';
            lineas.push(`${letra}. ${texto}`);
        });

        return lineas.join('\n');
    }

    function copiarAlPortapapeles(texto) {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            return navigator.clipboard.writeText(texto);
        }

        return new Promise((resolve, reject) => {
            try {
                const ta = document.createElement('textarea');
                ta.value = texto;
                ta.setAttribute('readonly', '');
                ta.style.position = 'fixed';
                ta.style.top = '-1000px';
                ta.style.left = '-1000px';
                document.body.appendChild(ta);
                ta.select();
                ta.setSelectionRange(0, ta.value.length);
                const ok = document.execCommand('copy');
                document.body.removeChild(ta);
                ok ? resolve() : reject(new Error('execCommand copy falló'));
            } catch (err) {
                reject(err);
            }
        });
    }

    window.copyQuestion = function (idx, btn) {
        const p = preguntas[idx];
        if (!p) return;

        const texto = buildQuestionPlainText(p);

        copiarAlPortapapeles(texto)
            .then(() => {
                if (btn) {
                    btn.classList.add('copied');
                    if (btn._copyTimeout) clearTimeout(btn._copyTimeout);
                    btn._copyTimeout = setTimeout(() => {
                        btn.classList.remove('copied');
                        btn._copyTimeout = null;
                    }, 1200);
                }
            })
            .catch(err => {
                console.warn('[Copiar] No se pudo copiar al portapapeles:', err);
            });
    };

    // ============================================================
    // 14. SIMULACRO: INFO Y FINALIZACIÓN
    // ============================================================
    function computePracticeStats() {
        let correct = 0, incorrect = 0, blank = 0, answered = 0;
        sessionIds.forEach(idx => {
            if (!practiceRevealed[idx]) { blank++; return; }
            answered++;
            if (practiceFeedback[idx] === 'correct') correct++;
            else incorrect++;
        });
        return { correct, incorrect, blank, answered, total: sessionIds.length, flagged: 0 };
    }

    function computeSimulacroStats() {
        let correct = 0, incorrect = 0, blank = 0, answered = 0;
        sessionIds.forEach(idx => {
            const sel = simulacroState.answers[idx];
            if (!sel) { blank++; return; }
            answered++;
            if (sel === preguntas[idx].respuesta) correct++;
            else incorrect++;
        });
        return {
            correct, incorrect, blank, answered,
            total: sessionIds.length,
            flagged: simulacroState.flagged.size
        };
    }

    function updateQuizInfoPanel() {
        const s = (currentMode === MODE_PRACTICE)
            ? computePracticeStats()
            : computeSimulacroStats();

        simAnswered.textContent = s.answered;
        simTotal.textContent = s.total;
        simCorrect.textContent = s.correct;
        simIncorrect.textContent = s.incorrect;
        simBlank.textContent = s.blank;
        if (simFlagged) simFlagged.textContent = s.flagged || 0;
    }

    function resetSimulacro() {
        if (!confirm('¿Estás seguro de reiniciar el simulacro? Se perderá todo el progreso.')) return;

        const timeLimitSec = simulacroState.timeLimit;

        simulacroState = {
            answers: {},
            flagged: new Set(),
            revealed: false,
            startTime: Date.now(),
            endTime: null,
            timeLimit: timeLimitSec,
            remaining: timeLimitSec,
            elapsedPrevios: 0,
            timeUp: false,
            warnLevel: 0
        };
        currentIndex = 0;
        updateQuizInfoPanel();
        startSimTimer();
        updateQuizModeLabel();
        renderPage();
        saveSimulacroState();
    }

    window.openFinishModal = function () {
        if (currentMode !== MODE_SIMULACRO) return;
        if (simulacroState.revealed) return;

        const s = computeSimulacroStats();
        finishAnswered.textContent = s.answered;
        finishTotal.textContent = s.total;

        if (finishStatAnswered) finishStatAnswered.textContent = s.answered;
        if (finishStatFlagged) finishStatFlagged.textContent = s.flagged;
        if (finishStatBlank) finishStatBlank.textContent = s.blank;

        if (s.blank > 0 || s.flagged > 0) {
            let msg = '';
            if (s.blank > 0) msg += `Tienes <strong>${s.blank}</strong> pregunta(s) sin responder. `;
            if (s.flagged > 0) msg += `Tienes <strong>${s.flagged}</strong> marcada(s) para revisar. `;
            msg += `¿Seguro que quieres finalizar?`;
            finishWarning.innerHTML = msg;
        } else {
            finishWarning.innerHTML = `Has respondido todas las preguntas. ¡Listo para ver tu puntaje!`;
        }

        finishModal.style.display = 'flex';
    };

    function closeFinishModal() {
        finishModal.style.display = 'none';
    }

    function confirmFinishSimulacro() {
        closeFinishModal();
        simulacroState.revealed = true;
        simulacroState.endTime = Date.now();
        stopSimTimer();
        clearSavedSimulacroState();
        registrarDominioSimulacro();
        showResults();
    }

    function registrarDominioSimulacro() {
        if (!window.Dominio) return;
        sessionIds.forEach(idx => {
            const p = preguntas[idx];
            const sel = simulacroState.answers[idx];
            if (!sel) return;
            const acierto = (sel === p.respuesta);
            const dudaba = simulacroState.flagged.has(idx);
            window.Dominio.registrarIntento(getPreguntaId(p), acierto, dudaba);
        });
        updatePerfilResumen();
    }

    // ============================================================
    // 15. PANTALLA DE RESULTADOS
    // ============================================================
    function showResults() {
        const s = computeSimulacroStats();
        const total = s.total;
        const pct = total === 0 ? 0 : Math.round((s.correct / total) * 100);

        let icon = '🎯';
        let title = 'Simulacro finalizado';
        let subtitle = 'Aquí tienes tu desempeño detallado.';
        if (pct >= 85) {
            icon = '🏆'; title = '¡Excelente desempeño!';
            subtitle = 'Estás en un nivel sobresaliente. Sigue así.';
        } else if (pct >= 70) {
            icon = '🎯'; title = 'Buen desempeño';
            subtitle = 'Vas por buen camino. Refuerza las áreas débiles.';
        } else if (pct >= 50) {
            icon = '📚'; title = 'Desempeño regular';
            subtitle = 'Hay margen de mejora. Revisa las áreas con menor puntaje.';
        } else {
            icon = '💪'; title = 'A seguir estudiando';
            subtitle = 'Concéntrate en las áreas con menor puntaje y vuelve a intentarlo.';
        }

        if (simulacroState.timeUp) {
            icon = '⏰'; title = 'Tiempo agotado';
            subtitle = 'Se acabó el tiempo límite. Aquí tienes tu desempeño.';
        }

        resultsHeroIcon.textContent = icon;
        resultsTitle.textContent = title;
        resultsSubtitle.textContent = subtitle;

        resultsPercent.textContent = `${pct}%`;
        resultsCorrect.textContent = s.correct;
        resultsIncorrect.textContent = s.incorrect;
        resultsBlank.textContent = s.blank;

        let color = 'var(--danger)';
        if (pct >= 70) color = 'var(--success)';
        else if (pct >= 50) color = 'var(--warning)';
        scoreCircle.style.background = `conic-gradient(${color} 0% ${pct}%, var(--border) ${pct}% 100%)`;

        simulacroState.elapsedPrevios = simulacroState.elapsedPrevios || 0;
        const elapsedSec = simulacroState.elapsedPrevios
            + Math.max(0, Math.floor((simulacroState.endTime - simulacroState.startTime) / 1000));
        resultsTime.textContent = formatTime(elapsedSec);
        const avg = total > 0 ? Math.round(elapsedSec / total) : 0;
        resultsAvg.textContent = `${avg}s`;

        renderBreakdown('area', resultsByArea);
        renderBreakdown('especialidad', resultsByEspecialidad);

        showScreen('results');
    }

    function renderBreakdown(campo, contenedor) {
        const grupos = {};

        sessionIds.forEach(idx => {
            const p = preguntas[idx];
            const key = p[campo] || 'Sin categoría';
            if (!grupos[key]) grupos[key] = { total: 0, correct: 0, incorrect: 0, blank: 0 };
            grupos[key].total++;

            const sel = simulacroState.answers[idx];
            if (!sel) grupos[key].blank++;
            else if (sel === p.respuesta) grupos[key].correct++;
            else grupos[key].incorrect++;
        });

        const entries = Object.entries(grupos).sort((a, b) => {
            const pa = a[1].total ? a[1].correct / a[1].total : 0;
            const pb = b[1].total ? b[1].correct / b[1].total : 0;
            return pa - pb;
        });

        if (entries.length === 0) {
            contenedor.innerHTML = `<p style="color:var(--text-tertiary);font-size:13px;">Sin datos.</p>`;
            return;
        }

        contenedor.innerHTML = entries.map(([nombre, g]) => {
            const pct = g.total ? Math.round((g.correct / g.total) * 100) : 0;
            let barClass = 'high';
            if (pct < 50) barClass = 'low';
            else if (pct < 70) barClass = 'mid';

            return `
                <div class="breakdown-row">
                    <div class="breakdown-header">
                        <span class="breakdown-name">${nombre}</span>
                        <span class="breakdown-score">
                            ${g.correct}/${g.total}
                            <span class="breakdown-pct ${barClass}">${pct}%</span>
                        </span>
                    </div>
                    <div class="breakdown-bar-bg">
                        <div class="breakdown-bar-fill ${barClass}" style="width:${pct}%"></div>
                    </div>
                    <div class="breakdown-meta">
                        <span class="meta-correct">${g.correct} correctas</span>
                        <span class="meta-incorrect">${g.incorrect} incorrectas</span>
                        <span class="meta-blank">${g.blank} en blanco</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ============================================================
    // 16. PANTALLA DE REVISIÓN
    // ============================================================
    function openReview() {
        reviewFilter = 'all';
        reviewFilterBtns.forEach(b => b.classList.toggle('active', b.dataset.filter === 'all'));
        recomputeReviewIds();
        reviewIndex = 0;
        showScreen('review');
        renderReviewPage();
    }

    function recomputeReviewIds() {
        reviewIds = sessionIds.filter(idx => {
            const sel = simulacroState.answers[idx];
            if (reviewFilter === 'all') return true;
            if (reviewFilter === 'wrong') return !!sel && sel !== preguntas[idx].respuesta;
            if (reviewFilter === 'blank') return !sel;
            return true;
        });
    }

    function renderReviewPage() {
        const total = reviewIds.length;

        if (total === 0) {
            reviewContainer.innerHTML = `
                <div class="review-empty">
                    <p>No hay preguntas en esta categoría.</p>
                </div>
            `;
            reviewPosition.textContent = `0 / 0`;
            reviewCounter.textContent = `0 / 0`;
            progressBarFillReview.style.width = '0%';
            reviewPrev.disabled = true;
            reviewNext.disabled = true;
            return;
        }

        if (reviewIndex < 0) reviewIndex = 0;
        if (reviewIndex >= total) reviewIndex = total - 1;

        const idx = reviewIds[reviewIndex];
        const p = preguntas[idx];
        const sel = simulacroState.answers[idx] || '';
        const isCorrect = sel === p.respuesta;
        const isBlank = !sel;

        const letras = getLetras(p);

        const opcionesHtml = letras.map(letra => {
            const texto = p.opciones[letra] || '';
            let classes = 'option-item disabled';
            if (letra === p.respuesta) classes += ' correct';
            if (letra === sel && letra !== p.respuesta) classes += ' wrong';

            return `
                <div class="${classes}">
                    <span class="letter">${letra}</span>
                    <span class="option-text">${texto}</span>
                    ${letra === p.respuesta ? '<span class="badge-correct">Correcta</span>' : ''}
                    ${letra === sel && letra !== p.respuesta ? '<span class="badge-wrong">Tu respuesta</span>' : ''}
                </div>
            `;
        }).join('');

        let statusHtml = '';
        if (isBlank) {
            statusHtml = `<div class="feedback" style="background:var(--surface-3);color:var(--text-secondary);border-left-color:var(--border-strong);">No respondiste esta pregunta. La correcta era <strong>${p.respuesta}</strong>.</div>`;
        } else if (isCorrect) {
            statusHtml = `<div class="feedback correct">${ICONS.check} ¡Correcto!</div>`;
        } else {
            statusHtml = `<div class="feedback wrong">${ICONS.x} Incorrecto. La respuesta correcta era <strong>${p.respuesta}</strong>.</div>`;
        }

        const idPreg = getPreguntaId(p);
        const infoDom = window.Dominio ? window.Dominio.getInfo(idPreg) : null;
        const estadoDom = infoDom ? infoDom.estado : null;

        const estadoLabel = {
            dominada: 'Dominada',
            dudosa:   'Dudosa',
            fallada:  'Fallada'
        };
        const estadoClase = {
            dominada: 'dom-dominada',
            dudosa:   'dom-dudosa',
            fallada:  'dom-fallada'
        };

        let dominioHtml = '';
        if (estadoDom) {
            dominioHtml = `
                <div class="review-dominio">
                    <div class="review-dominio-info">
                        <span class="review-dominio-label">Estado actual:</span>
                        <span class="review-dominio-badge ${estadoClase[estadoDom]}">${estadoLabel[estadoDom]}</span>
                        <span class="review-dominio-meta">
                            ${infoDom.aciertos || 0} aciertos ·
                            ${infoDom.fallos || 0} fallos ·
                            ${infoDom.dudas || 0} dudas
                        </span>
                    </div>
                    <div class="review-dominio-actions">
                        <button class="btn-dom-ok" onclick="window.marcarYaEntiendo(${idx})">
                            ${ICONS.check} Ya la entiendo
                        </button>
                        <button class="btn-dom-duda" onclick="window.marcarAunDudo(${idx})">
                            ${ICONS.refresh} Aún dudo
                        </button>
                    </div>
                </div>
            `;
        }

        reviewContainer.innerHTML = `
            <div class="question-card ${isBlank ? '' : (isCorrect ? 'correct-answered' : 'wrong-answered')}">
                ${buildQuestionHeader(p, true, idx)}
                <div class="question-text">${p.enunciado}</div>
                <div class="options-list">${opcionesHtml}</div>
                ${statusHtml}
                <div class="explanation"><strong>${ICONS.bulb} Explicación:</strong> ${p.explicacion}</div>
                ${dominioHtml}
            </div>
        `;

        reviewPosition.textContent = `${reviewIndex + 1} / ${total}`;
        reviewCounter.textContent = `${reviewIndex + 1} / ${total}`;

        const pct = total === 0 ? 0 : ((reviewIndex + 1) / total) * 100;
        progressBarFillReview.style.width = `${pct}%`;

        reviewPrev.disabled = reviewIndex <= 0;
        reviewNext.disabled = reviewIndex >= total - 1;
    }

    // ============================================================
    // 17. NAVEGACIÓN ENTRE PREGUNTAS
    // ============================================================
    function goToPrev() {
        if (currentIndex > 0) {
            currentIndex--;
            renderPage();
            saveSimulacroState();
        }
    }

    function goToNext() {
        if (currentIndex < sessionIds.length - 1) {
            currentIndex++;
            renderPage();
            saveSimulacroState();
        }
    }

    function goToPosition(n) {
        const pos = parseInt(n, 10);
        if (isNaN(pos)) return false;
        if (pos < 1 || pos > sessionIds.length) return false;
        currentIndex = pos - 1;
        renderPage();
        saveSimulacroState();
        return true;
    }

    // ============================================================
    // 18. MAPA DE PREGUNTAS
    // ============================================================
    function openAnswerMap() {
        if (currentMode !== MODE_SIMULACRO) return;
        renderAnswerMap();
        answerMapModal.style.display = 'flex';
    }

    function closeAnswerMap() {
        answerMapModal.style.display = 'none';
    }

    function renderAnswerMap() {
        if (!answerMapGrid) return;
        const total = sessionIds.length;

        answerMapGrid.innerHTML = sessionIds.map((idx, i) => {
            const answered = !!simulacroState.answers[idx];
            const flagged = simulacroState.flagged.has(idx);
            const isCurrent = i === currentIndex;
            let cls = 'map-cell';
            if (isCurrent) cls += ' current';
            if (flagged) cls += ' flagged';
            else if (answered) cls += ' answered';
            return `<button class="${cls}" data-pos="${i}" title="Pregunta ${i + 1}">${i + 1}</button>`;
        }).join('');

        const s = computeSimulacroStats();
        if (answerMapSummary) {
            answerMapSummary.innerHTML = `
                <span class="map-sum-item">Total: <strong>${total}</strong></span>
                <span class="map-sum-item">Respondidas: <strong>${s.answered}</strong></span>
                <span class="map-sum-item">Marcadas: <strong>${s.flagged}</strong></span>
                <span class="map-sum-item">En blanco: <strong>${s.blank}</strong></span>
            `;
        }
    }

    function handleAnswerMapClick(e) {
        const btn = e.target.closest('.map-cell');
        if (!btn) return;
        const pos = parseInt(btn.dataset.pos, 10);
        if (isNaN(pos)) return;
        currentIndex = pos;
        closeAnswerMap();
        renderPage();
        saveSimulacroState();
    }

    // ============================================================
    // 19. EVENTOS
    // ============================================================
    setupModePractice.addEventListener('click', () => {
        currentMode = MODE_PRACTICE;
        setupModePractice.classList.add('active');
        setupModeSimulacro.classList.remove('active');
        modeHelp.textContent = 'En práctica, ves la explicación inmediatamente al responder.';
        updateSetupSummary();
    });

    setupModeSimulacro.addEventListener('click', () => {
        currentMode = MODE_SIMULACRO;
        setupModeSimulacro.classList.add('active');
        setupModePractice.classList.remove('active');
        modeHelp.textContent = 'En simulacro, respondes todas las preguntas y ves resultados al finalizar (estilo CONAREME).';
        updateSetupSummary();
    });

    enfoqueBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            enfoqueBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentEnfoque = btn.dataset.enfoque;
            applyFilters();
        });
    });

    // ---- Banco de preguntas ----
    if (filterSource) {
        filterSource.addEventListener('change', () => {
            const val = filterSource.value;

            if (val === SOURCE_ALL_ID) {
                if (currentSource && currentSource.id === SOURCE_ALL_ID) return;
                loadSource({ id: SOURCE_ALL_ID, name: 'Todos', file: null });
                return;
            }

            const nuevo = dataSources.find(s => s.id === val);
            if (!nuevo || nuevo === currentSource) return;
            loadSource(nuevo);
        });
    }

    filterArea.addEventListener('change', () => {
        updateDependentFilters();
        applyFilters();
    });

    filterEspecialidad.addEventListener('change', () => {
        updateDependentFilters();
        applyFilters();
    });

    filterTema.addEventListener('change', applyFilters);
    filterDificultad.addEventListener('change', applyFilters);
    filterEstado.addEventListener('change', applyFilters);

    resetBtn.addEventListener('click', () => {
        filterArea.value = 'all';
        updateDependentFilters();
        filterEspecialidad.value = 'all';
        filterTema.value = 'all';
        filterDificultad.value = 'all';
        filterEstado.value = 'all';
        applyFilters();
    });

    countButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            countButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const valor = btn.dataset.count;
            selectedCount = valor === 'all' ? 'all' : parseInt(valor, 10);
            customCountInput.value = '';
            updateSetupSummary();
        });
    });

    customCountInput.addEventListener('input', () => {
        if (customCountInput.value === '') return;
        let valor = parseInt(customCountInput.value, 10);
        if (isNaN(valor) || valor < 1) return;
        countButtons.forEach(b => b.classList.remove('active'));
        selectedCount = valor;
        updateSetupSummary();
    });

    customCountInput.addEventListener('blur', () => {
        if (customCountInput.value !== '') return;
        if (selectedCount === 'all') {
            const allBtn = Array.from(countButtons).find(b => b.dataset.count === 'all');
            if (allBtn) allBtn.classList.add('active');
        } else {
            const matchingBtn = Array.from(countButtons)
                .find(b => parseInt(b.dataset.count, 10) === selectedCount);
            if (matchingBtn) matchingBtn.classList.add('active');
        }
    });

    customTimeInput.addEventListener('input', () => {
        const raw = customTimeInput.value.trim();
        if (raw === '') {
            selectedTimeLimitMin = null;
            updateSetupSummary();
            return;
        }
        let valor = parseInt(raw, 10);
        if (isNaN(valor) || valor < 1) return;
        selectedTimeLimitMin = valor;
        updateSetupSummary();
    });

    customTimeInput.addEventListener('blur', () => {
        const raw = customTimeInput.value.trim();
        if (raw === '') {
            selectedTimeLimitMin = null;
        } else {
            let valor = parseInt(raw, 10);
            if (isNaN(valor) || valor < 1) {
                selectedTimeLimitMin = null;
            } else {
                selectedTimeLimitMin = valor;
            }
        }
        syncTimeInput();
        updateSetupSummary();
    });

    startSessionBtn.addEventListener('click', startSession);
    backToSetupBtn.addEventListener('click', goBackToSetup);
    prevBtn.addEventListener('click', goToPrev);
    nextBtn.addEventListener('click', goToNext);
    resetSimulacroBtn.addEventListener('click', resetSimulacro);

    if (finishSimulacroBtn) {
        finishSimulacroBtn.addEventListener('click', () => {
            window.openFinishModal();
        });
    }

    openMapBtn.addEventListener('click', openAnswerMap);
    closeAnswerMapBtn.addEventListener('click', closeAnswerMap);
    closeAnswerMapFooterBtn.addEventListener('click', closeAnswerMap);
    answerMapModal.addEventListener('click', (e) => {
        if (e.target === answerMapModal) closeAnswerMap();
    });
    answerMapGrid.addEventListener('click', handleAnswerMapClick);

    goToQuestionInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const ok = goToPosition(goToQuestionInput.value);
            if (ok) {
                goToQuestionInput.value = '';
                goToQuestionInput.blur();
            } else {
                goToQuestionInput.classList.add('invalid');
                setTimeout(() => goToQuestionInput.classList.remove('invalid'), 700);
            }
        }
        if (e.key === 'Escape') {
            goToQuestionInput.value = '';
            goToQuestionInput.blur();
        }
    });

    resumeContinueBtn.addEventListener('click', resumeSimulacroFromStorage);
    discardResumeBtn.addEventListener('click', discardSavedSimulacro);

    continueBtn.addEventListener('click', openContinueModal);
    closeModalBtn.addEventListener('click', closeContinueModal);
    cancelModalBtn.addEventListener('click', closeContinueModal);
    confirmModalBtn.addEventListener('click', addMoreQuestions);

    continueModal.addEventListener('click', (e) => {
        if (e.target === continueModal) closeContinueModal();
    });

    modalCountSelector.addEventListener('click', (e) => {
        const btn = e.target.closest('.count-btn');
        if (!btn) return;
        modalCountSelector.querySelectorAll('.count-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const val = btn.dataset.count;
        modalSelectedCount = val === 'all' ? 'all' : parseInt(val, 10);
        modalCustomCount.value = '';
        syncModalTimeInput();
    });

    modalCustomCount.addEventListener('input', () => {
        if (modalCustomCount.value === '') return;
        const valor = parseInt(modalCustomCount.value, 10);
        if (isNaN(valor) || valor < 1) return;
        modalCountSelector.querySelectorAll('.count-btn').forEach(b => b.classList.remove('active'));
        modalSelectedCount = valor;
        syncModalTimeInput();
    });

    modalCustomCount.addEventListener('blur', () => {
        if (modalCustomCount.value !== '') return;
        if (modalSelectedCount === 'all') {
            const allBtn = modalCountSelector.querySelector('.count-btn[data-count="all"]');
            if (allBtn) allBtn.classList.add('active');
        } else {
            const matchingBtn = Array.from(modalCountSelector.querySelectorAll('.count-btn'))
                .find(b => parseInt(b.dataset.count, 10) === modalSelectedCount);
            if (matchingBtn) matchingBtn.classList.add('active');
        }
        syncModalTimeInput();
    });

    closeFinishModalBtn.addEventListener('click', closeFinishModal);
    cancelFinishBtn.addEventListener('click', closeFinishModal);
    confirmFinishBtn.addEventListener('click', confirmFinishSimulacro);
    finishModal.addEventListener('click', (e) => {
        if (e.target === finishModal) closeFinishModal();
    });

    confirmTimeUpBtn.addEventListener('click', confirmTimeUp);

    reviewAnswersBtn.addEventListener('click', openReview);
    backToSetupFromResults.addEventListener('click', () => {
        volverAlSetup();
    });
    retrySimulacroBtn.addEventListener('click', () => {
        if (!confirm('¿Repetir el simulacro con las mismas preguntas?')) return;
        const timeLimitSec = simulacroState.timeLimit;
        simulacroState = {
            answers: {},
            flagged: new Set(),
            revealed: false,
            startTime: Date.now(),
            endTime: null,
            timeLimit: timeLimitSec,
            remaining: timeLimitSec,
            elapsedPrevios: 0,
            timeUp: false,
            warnLevel: 0
        };
        currentIndex = 0;
        updateQuizInfoPanel();
        showScreen('quiz');
        updateQuizModeLabel();
        startSimTimer();
        renderPage();
        saveSimulacroState();
    });

    backToResultsBtn.addEventListener('click', () => {
        showScreen('results');
    });
    reviewPrev.addEventListener('click', () => {
        if (reviewIndex > 0) {
            reviewIndex--;
            renderReviewPage();
        }
    });
    reviewNext.addEventListener('click', () => {
        if (reviewIndex < reviewIds.length - 1) {
            reviewIndex++;
            renderReviewPage();
        }
    });

    reviewFilterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            reviewFilterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            reviewFilter = btn.dataset.filter;
            recomputeReviewIds();
            reviewIndex = 0;
            renderReviewPage();
        });
    });

    window.addEventListener('beforeunload', () => {
        if (currentMode === MODE_SIMULACRO && !simulacroState.revealed && sessionIds.length > 0) {
            saveSimulacroState();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
        if (e.ctrlKey || e.altKey || e.metaKey) return;

        if (resumeModal.style.display === 'flex') {
            if (e.key === 'Enter') {
                e.preventDefault();
                resumeSimulacroFromStorage();
            }
            return;
        }

        if (e.key === 'Escape') {
            if (answerMapModal.style.display === 'flex') { closeAnswerMap(); return; }
            if (continueModal.style.display === 'flex') { closeContinueModal(); return; }
            if (finishModal.style.display === 'flex') { closeFinishModal(); return; }
            return;
        }

        if (e.key === 'Backspace') {
            if (screenQuiz.classList.contains('active')) {
                e.preventDefault();
                goBackToSetup();
            }
            return;
        }

        if (screenQuiz.classList.contains('active')) {
            if (e.key === 'ArrowLeft') { goToPrev(); return; }
            if (e.key === 'ArrowRight') { goToNext(); return; }

            if (currentMode === MODE_SIMULACRO && !simulacroState.revealed) {
                const teclaAtajo = e.key.toUpperCase();
                if (teclaAtajo === 'M') {
                    e.preventDefault();
                    const idxActual = sessionIds[currentIndex];
                    if (idxActual !== undefined) window.toggleFlag(idxActual);
                    return;
                }
                if (teclaAtajo === 'G') {
                    e.preventDefault();
                    openAnswerMap();
                    return;
                }
                if (teclaAtajo === 'F') {
                    e.preventDefault();
                    window.openFinishModal();
                    return;
                }
            }

            const tecla = e.key.toUpperCase();
            if (!/^[A-E]$/.test(tecla)) return;
            if (sessionIds.length === 0) return;

            const idx = sessionIds[currentIndex];
            const p = preguntas[idx];
            const letrasDisponibles = getLetras(p);
            if (!letrasDisponibles.includes(tecla)) return;

            if (currentMode === MODE_PRACTICE) {
                if (!practiceRevealed[idx]) window.handlePracticeAnswer(idx, tecla);
            } else {
                if (!simulacroState.revealed) window.handleSimulacroAnswer(idx, tecla);
            }
            return;
        }

        if (screenReview.classList.contains('active')) {
            if (e.key === 'ArrowLeft') {
                if (reviewIndex > 0) { reviewIndex--; renderReviewPage(); }
                return;
            }
            if (e.key === 'ArrowRight') {
                if (reviewIndex < reviewIds.length - 1) { reviewIndex++; renderReviewPage(); }
                return;
            }
        }
    });

    // ============================================================
    // 20. ARRANQUE
    // ============================================================
    loadSourcesManifest();

})();