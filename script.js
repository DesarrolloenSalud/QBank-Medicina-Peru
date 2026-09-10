// script.js
// ============================================================
// QBank Medicina Perú - Lógica principal
// ============================================================
// Pantallas:
//   1. Setup (configuración de la sesión)
//   2. Quiz (cuestionario)
// ============================================================

(function () {
    'use strict';

    // ============================================================
    // 1. CONSTANTES
    // ============================================================
    const DATA_URL = 'data/Examen_25A.json';
    const MODE_PRACTICE = 'practice';
    const MODE_SIMULACRO = 'simulacro';

    // ============================================================
    // 2. ESTADO GLOBAL
    // ============================================================
    let preguntas = [];              // Todas las preguntas cargadas
    let filteredIds = [];            // Índices de preguntas que pasan los filtros
    let sessionIds = [];             // Índices de la sesión actual (a resolver)
    let currentIndex = 0;            // Posición actual dentro de sessionIds
    let currentMode = MODE_PRACTICE; // Modo actual: 'practice' | 'simulacro'
    let selectedCount = 20;          // Número de preguntas elegido (o 'all')

    // Estado del modo práctica
    let practiceAnswers = {};        // { idx: letra_elegida }
    let practiceFeedback = {};       // { idx: 'correct' | 'wrong' }
    let practiceRevealed = {};       // { idx: true | false }

    // Estado del modo simulacro
    let simulacroState = {
        answers: {},
        isLocked: {},
        correct: 0,
        incorrect: 0,
        answered: 0
    };

    // Preguntas ya mostradas en la sesión (para no repetir al agregar más)
    let usedSessionIds = new Set();

    // Selección de cantidad en el modal
    let modalSelectedCount = 10;

    // ============================================================
    // 3. REFERENCIAS AL DOM
    // ============================================================
    // Pantallas
    const screenSetup = document.getElementById('screenSetup');
    const screenQuiz = document.getElementById('screenQuiz');

    // Setup
    const setupModePractice = document.getElementById('setupModePractice');
    const setupModeSimulacro = document.getElementById('setupModeSimulacro');
    const modeHelp = document.getElementById('modeHelp');
    const startSessionBtn = document.getElementById('startSession');
    const summaryMode = document.getElementById('summaryMode');
    const summaryFilters = document.getElementById('summaryFilters');
    const summaryAvailable = document.getElementById('summaryAvailable');
    const summaryCount = document.getElementById('summaryCount');
    const countButtons = document.querySelectorAll('.count-btn');
    const customCountInput = document.getElementById('customCount');
    const shuffleCheckbox = document.getElementById('shuffleQuestions');

    // Filtros
    const filterArea = document.getElementById('filterArea');
    const filterEspecialidad = document.getElementById('filterEspecialidad');
    const filterTema = document.getElementById('filterTema');
    const filterDificultad = document.getElementById('filterDificultad');
    const filterEstado = document.getElementById('filterEstado');
    const resetBtn = document.getElementById('resetFilters');
    const totalSpan = document.getElementById('totalQuestions');

    // Quiz
    const backToSetupBtn = document.getElementById('backToSetup');
    const quizModeLabel = document.getElementById('quizModeLabel');
    const progressBarFill = document.getElementById('progressBarFill');
    const questionPosition = document.getElementById('questionPosition');
    const container = document.getElementById('questionContainer');
    const prevBtn = document.getElementById('prevQuestion');
    const nextBtn = document.getElementById('nextQuestion');

    // Simulacro info
    const simulacroInfo = document.getElementById('simulacroInfo');
    const simAnswered = document.getElementById('simAnswered');
    const simTotal = document.getElementById('simTotal');
    const simCorrect = document.getElementById('simCorrect');
    const simIncorrect = document.getElementById('simIncorrect');
    const resetSimulacroBtn = document.getElementById('resetSimulacro');

    // Continuar / modal
    const continueBar = document.getElementById('continueBar');
    const continueBtn = document.getElementById('continueBtn');
    const continueInfoText = document.getElementById('continueInfoText');
    const continueModal = document.getElementById('continueModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const cancelModalBtn = document.getElementById('cancelModalBtn');
    const confirmModalBtn = document.getElementById('confirmModalBtn');
    const modalRemaining = document.getElementById('modalRemaining');
    const modalCountSelector = document.getElementById('modalCountSelector');
    const modalCustomCount = document.getElementById('modalCustomCount');
    const modalShuffle = document.getElementById('modalShuffle');

    // ============================================================
    // 4. UTILIDADES
    // ============================================================
    function getLetras(pregunta) {
        return Object.keys(pregunta.opciones || {}).sort();
    }

    /** Fisher-Yates shuffle */
    function shuffle(array) {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    // ============================================================
    // 5. CARGA DE DATOS
    // ============================================================
    function loadData() {
        fetch(DATA_URL)
            .then(response => {
                if (!response.ok) throw new Error('No se pudo cargar el archivo JSON');
                return response.json();
            })
            .then(data => {
                preguntas = data;
                console.log(`✅ ${preguntas.length} preguntas cargadas desde ${DATA_URL}`);
                totalSpan.textContent = preguntas.length;
                populateAllFilters();
                applyFilters();
            })
            .catch(err => {
                console.error('Error al cargar los datos:', err);
                container.innerHTML = `
                    <div style="padding:40px;text-align:center;color:#b12a2a;background:#fde8e8;border-radius:16px;">
                        <h3>❌ Error al cargar los datos</h3>
                        <p style="margin-top:8px;">Verifica que el archivo <strong>${DATA_URL}</strong> exista.</p>
                        <p style="font-size:13px;color:#666;margin-top:4px;">${err.message}</p>
                    </div>
                `;
            });
    }

    // ============================================================
    // 6. FILTROS
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

    /** Aplica filtros y actualiza el resumen del setup. */
    function applyFilters() {
        const filtros = {
            area: filterArea.value,
            especialidad: filterEspecialidad.value,
            tema: filterTema.value,
            dificultad: filterDificultad.value,
            estado: filterEstado.value
        };

        filteredIds = preguntas
            .map((p, idx) => ({ ...p, idx }))
            .filter(p => cumpleFiltros(p, filtros))
            .map(p => p.idx);

        updateSetupSummary();
    }

    function cumpleFiltros(pregunta, filtros) {
        for (const [campo, valor] of Object.entries(filtros)) {
            if (valor !== 'all' && pregunta[campo] !== valor) return false;
        }
        return true;
    }

    // ============================================================
    // 7. SETUP: RESUMEN Y ARRANQUE DE SESIÓN
    // ============================================================
    function updateSetupSummary() {
        const disponible = filteredIds.length;
        const aResolver = selectedCount === 'all'
            ? disponible
            : Math.min(selectedCount, disponible);

        summaryMode.textContent = currentMode === MODE_PRACTICE ? 'Práctica' : 'Simulacro';
        summaryFilters.textContent = buildFilterLabel();
        summaryAvailable.textContent = disponible;
        summaryCount.textContent = aResolver;

        startSessionBtn.disabled = disponible === 0;
    }

    function buildFilterLabel() {
        const activos = [];
        if (filterArea.value !== 'all') activos.push(filterArea.value);
        if (filterEspecialidad.value !== 'all') activos.push(filterEspecialidad.value);
        if (filterTema.value !== 'all') activos.push(filterTema.value);
        if (filterDificultad.value !== 'all') activos.push(filterDificultad.value);
        if (filterEstado.value !== 'all') activos.push(filterEstado.value);
        return activos.length ? activos.join(' · ') : 'Todas';
    }

    /** Prepara sessionIds y arranca el cuestionario. */
    function startSession() {
        if (filteredIds.length === 0) return;

        // Elegir cuántas y cuáles
        let base = [...filteredIds];
        if (shuffleCheckbox.checked) base = shuffle(base);

        const cantidad = selectedCount === 'all'
            ? base.length
            : Math.min(selectedCount, base.length);

        sessionIds = base.slice(0, cantidad);

        // Marcar como usadas
        usedSessionIds = new Set(sessionIds);

        // Resetear estado
        currentIndex = 0;
        practiceAnswers = {};
        practiceFeedback = {};
        practiceRevealed = {};
        simulacroState = {
            answers: {},
            isLocked: {},
            correct: 0,
            incorrect: 0,
            answered: 0
        };

        // Cambiar a pantalla quiz
        showScreen('quiz');
        updateQuizModeLabel();
        updateSimulacroInfo();
        renderPage();
    }

    // ============================================================
    // 8. NAVEGACIÓN ENTRE PANTALLAS
    // ============================================================
    function showScreen(name) {
        if (name === 'setup') {
            screenSetup.classList.add('active');
            screenQuiz.classList.remove('active');
            continueBar.style.display = 'none';
        } else if (name === 'quiz') {
            screenSetup.classList.remove('active');
            screenQuiz.classList.add('active');
        }
    }

    function updateQuizModeLabel() {
        quizModeLabel.textContent = currentMode === MODE_PRACTICE ? 'Práctica' : 'Simulacro';
        simulacroInfo.style.display = currentMode === MODE_SIMULACRO ? 'flex' : 'none';
        resetSimulacroBtn.style.display = currentMode === MODE_SIMULACRO ? 'inline-flex' : 'none';
    }

    /** Vuelve al setup con confirmación si hay progreso. */
    function goBackToSetup() {
        const hayProgreso =
            simulacroState.answered > 0 ||
            Object.keys(practiceRevealed).length > 0;

        if (hayProgreso) {
            if (!confirm('¿Volver a la configuración? Se perderá el progreso de esta sesión.')) return;
        }
        showScreen('setup');
        updateSetupSummary();
    }

    // ============================================================
    // 8b. CONTINUAR CON MÁS PREGUNTAS
    // ============================================================

    /** Calcula las preguntas disponibles del filtro actual no usadas aún. */
    function getRemainingIds() {
        return filteredIds.filter(id => !usedSessionIds.has(id));
    }

    /**
     * Muestra u oculta el botón "Continuar".
     * Aparece solo cuando:
     *   - Estamos en la última pregunta del bloque.
     *   - La última pregunta YA fue respondida.
     *   - Quedan preguntas disponibles para agregar.
     */
    function updateContinueBar() {
        if (sessionIds.length === 0) {
            continueBar.style.display = 'none';
            return;
        }

        const isLast = currentIndex === sessionIds.length - 1;
        const remaining = getRemainingIds().length;

        // ¿La última pregunta del bloque ya fue respondida?
        const lastIdx = sessionIds[currentIndex];
        const lastAnswered = (currentMode === MODE_PRACTICE)
            ? !!practiceRevealed[lastIdx]
            : !!simulacroState.isLocked[lastIdx];

        if (isLast && lastAnswered && remaining > 0) {
            continueBar.style.display = 'flex';
            continueInfoText.textContent =
                `Has llegado al final del bloque. Quedan ${remaining} preguntas disponibles.`;
        } else {
            continueBar.style.display = 'none';
        }
    }

    /** Abre el modal de "agregar más preguntas". */
    function openContinueModal() {
        const remaining = getRemainingIds().length;
        if (remaining === 0) return;

        modalRemaining.textContent = remaining;

        // Reset visual del selector: por defecto, 10 o el máximo si hay menos
        modalSelectedCount = Math.min(10, remaining);

        Array.from(modalCountSelector.querySelectorAll('.count-btn')).forEach(btn => {
            btn.classList.remove('active');
            const val = btn.dataset.count;
            if (val !== 'all' && parseInt(val, 10) === modalSelectedCount) {
                btn.classList.add('active');
            }
        });

        // Si no coincidió ningún botón (ej: remaining < 10), marcar "Todas"
        if (!modalCountSelector.querySelector('.count-btn.active')) {
            const allBtn = modalCountSelector.querySelector('.count-btn[data-count="all"]');
            if (allBtn) allBtn.classList.add('active');
            modalSelectedCount = remaining;
        }

        modalCustomCount.value = '';
        modalShuffle.checked = true;

        continueModal.style.display = 'flex';
    }

    /** Cierra el modal. */
    function closeContinueModal() {
        continueModal.style.display = 'none';
    }

    /** Agrega N preguntas al final de sessionIds. */
    function addMoreQuestions() {
        const remainingIds = getRemainingIds();
        if (remainingIds.length === 0) {
            closeContinueModal();
            return;
        }

        // Determinar cuántas agregar
        let cantidad = modalSelectedCount === 'all'
            ? remainingIds.length
            : Math.min(modalSelectedCount, remainingIds.length);

        if (cantidad <= 0) return;

        // Barajar solo las nuevas
        let nuevas = [...remainingIds];
        if (modalShuffle.checked) nuevas = shuffle(nuevas);
        nuevas = nuevas.slice(0, cantidad);

        // Agregarlas a sessionIds y marcarlas como usadas
        sessionIds = sessionIds.concat(nuevas);
        nuevas.forEach(id => usedSessionIds.add(id));

        closeContinueModal();

        // Navegar a la primera nueva
        currentIndex = sessionIds.length - nuevas.length;
        renderPage();
        updateSimulacroInfo();
    }

    // ============================================================
    // 9. RENDERIZADO DEL CUESTIONARIO
    // ============================================================
    function renderPage() {
        if (sessionIds.length === 0) {
            container.innerHTML = `<p style="padding:40px;text-align:center;color:#5b6f87;">No hay preguntas para mostrar.</p>`;
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

    function buildQuestionHeader(p) {
        const difClass = `dificultad-${p.dificultad}`;
        const estadoClass = `estado-${p.estado}`;
        return `
            <div class="question-header">
                <span class="question-number">#${p.numero}</span>
                <div class="question-tags">
                    <span class="tag">${p.area}</span>
                    <span class="tag">${p.especialidad}</span>
                    <span class="tag">${p.tema}</span>
                    <span class="tag ${difClass}">${p.dificultad}</span>
                    <span class="tag ${estadoClass}">${p.estado}</span>
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
                    <span class="letter">${letra}.</span>
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
                       ? '✅ ¡Correcto!'
                       : `❌ Incorrecto. La respuesta correcta era ${p.respuesta}`}
               </div>`
            : '';

        const explanationHtml = isRevealed
            ? `<div class="explanation"><strong>💡 Explicación:</strong> ${p.explicacion}</div>`
            : '';

        return `
            <div class="${cardClass}">
                ${buildQuestionHeader(p)}
                <div class="question-text">${p.enunciado}</div>
                <div class="options-list">${opcionesHtml}</div>
                ${feedbackHtml}
                ${explanationHtml}
            </div>
        `;
    }

    function buildSimulacroCard(p, idx) {
        const isLocked = simulacroState.isLocked[idx] || false;
        const selected = simulacroState.answers[idx] || '';
        const isCorrect = selected === p.respuesta;
        const letras = getLetras(p);

        const opcionesHtml = letras.map(letra => {
            const texto = p.opciones[letra] || '';
            let classes = 'option-item';
            if (isLocked) {
                classes += ' disabled';
                if (letra === p.respuesta) classes += ' correct';
                if (letra === selected && letra !== p.respuesta) classes += ' wrong';
            } else {
                classes += ' clickable';
            }
            const onclick = isLocked
                ? ''
                : `onclick="window.handleSimulacroAnswer(${idx}, '${letra}')"`;

            return `
                <div class="${classes}" ${onclick}>
                    <span class="letter">${letra}.</span>
                    <span class="option-text">${texto}</span>
                </div>
            `;
        }).join('');

        let cardClass = 'question-card';
        if (isLocked) {
            cardClass += isCorrect ? ' correct-answered' : ' wrong-answered';
        }

        const feedbackHtml = isLocked
            ? `<div class="feedback ${isCorrect ? 'correct' : 'wrong'}">
                   ${isCorrect
                       ? '✅ ¡Correcto!'
                       : `❌ Incorrecto. La respuesta correcta era ${p.respuesta}`}
               </div>
               <div class="explanation"><strong>💡 Explicación:</strong> ${p.explicacion}</div>`
            : '';

        return `
            <div class="${cardClass}">
                ${buildQuestionHeader(p)}
                <div class="question-text">${p.enunciado}</div>
                <div class="options-list">${opcionesHtml}</div>
                ${feedbackHtml}
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

        // Actualizar la barra de "Continuar"
        updateContinueBar();
    }

    // ============================================================
    // 10. HANDLERS DE RESPUESTA
    // ============================================================
    window.handlePracticeAnswer = function (idx, answer) {
        if (practiceRevealed[idx]) return;
        const p = preguntas[idx];
        practiceAnswers[idx] = answer;
        practiceRevealed[idx] = true;
        practiceFeedback[idx] = (answer === p.respuesta) ? 'correct' : 'wrong';
        renderPage();
    };

    window.handleSimulacroAnswer = function (idx, answer) {
        if (simulacroState.isLocked[idx]) return;
        const p = preguntas[idx];
        const isCorrect = answer === p.respuesta;

        simulacroState.answers[idx] = answer;
        simulacroState.isLocked[idx] = true;
        if (isCorrect) simulacroState.correct++;
        else simulacroState.incorrect++;
        simulacroState.answered++;

        updateSimulacroInfo();
        renderPage();
    };

    // ============================================================
    // 11. SIMULACRO
    // ============================================================
    function updateSimulacroInfo() {
        simAnswered.textContent = simulacroState.answered;
        simTotal.textContent = sessionIds.length;
        simCorrect.textContent = simulacroState.correct;
        simIncorrect.textContent = simulacroState.incorrect;
    }

    function resetSimulacro() {
        if (!confirm('¿Estás seguro de reiniciar el simulacro? Se perderá todo el progreso.')) return;

        simulacroState = {
            answers: {},
            isLocked: {},
            correct: 0,
            incorrect: 0,
            answered: 0
        };
        currentIndex = 0;
        updateSimulacroInfo();
        renderPage();
    }

    // ============================================================
    // 12. NAVEGACIÓN ENTRE PREGUNTAS
    // ============================================================
    function goToPrev() {
        if (currentIndex > 0) {
            currentIndex--;
            renderPage();
        }
    }

    function goToNext() {
        if (currentIndex < sessionIds.length - 1) {
            currentIndex++;
            renderPage();
        }
    }

    // ============================================================
    // 13. EVENTOS
    // ============================================================

    // --- Setup: modos ---
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
        modeHelp.textContent = 'En simulacro, cada respuesta queda bloqueada y ves tu puntaje en tiempo real.';
        updateSetupSummary();
    });

    // --- Setup: filtros ---
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

    // --- Setup: número de preguntas (botones) ---
    countButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            countButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const valor = btn.dataset.count;
            selectedCount = valor === 'all' ? 'all' : parseInt(valor, 10);

            // Limpiar el input personalizado al elegir un botón
            customCountInput.value = '';

            updateSetupSummary();
        });
    });

    // --- Setup: número de preguntas (input personalizado) ---
    customCountInput.addEventListener('input', () => {
        // Si el input está vacío, no modificamos el valor vigente
        if (customCountInput.value === '') return;

        let valor = parseInt(customCountInput.value, 10);

        // Ignorar valores inválidos o menores a 1
        if (isNaN(valor) || valor < 1) return;

        // Desmarcar todos los botones porque el input manda
        countButtons.forEach(b => b.classList.remove('active'));

        selectedCount = valor;
        updateSetupSummary();
    });

    customCountInput.addEventListener('blur', () => {
        // Si el input queda vacío al perder el foco, restauramos la selección
        // visual del último valor vigente
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

    // --- Setup: iniciar sesión ---
    startSessionBtn.addEventListener('click', startSession);

    // --- Quiz: volver al setup ---
    backToSetupBtn.addEventListener('click', goBackToSetup);

    // --- Quiz: navegación ---
    prevBtn.addEventListener('click', goToPrev);
    nextBtn.addEventListener('click', goToNext);

    // --- Quiz: reiniciar simulacro ---
    resetSimulacroBtn.addEventListener('click', resetSimulacro);

    // --- Continuar / modal ---
    continueBtn.addEventListener('click', openContinueModal);
    closeModalBtn.addEventListener('click', closeContinueModal);
    cancelModalBtn.addEventListener('click', closeContinueModal);
    confirmModalBtn.addEventListener('click', addMoreQuestions);

    // Cerrar al hacer click fuera del modal
    continueModal.addEventListener('click', (e) => {
        if (e.target === continueModal) closeContinueModal();
    });

    // --- Modal: selector de cantidad ---
    modalCountSelector.addEventListener('click', (e) => {
        const btn = e.target.closest('.count-btn');
        if (!btn) return;

        modalCountSelector.querySelectorAll('.count-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const val = btn.dataset.count;
        modalSelectedCount = val === 'all' ? 'all' : parseInt(val, 10);

        // Limpiar input personalizado al elegir botón
        modalCustomCount.value = '';
    });

    // --- Modal: input personalizado ---
    modalCustomCount.addEventListener('input', () => {
        if (modalCustomCount.value === '') return;

        const valor = parseInt(modalCustomCount.value, 10);
        if (isNaN(valor) || valor < 1) return;

        modalCountSelector.querySelectorAll('.count-btn').forEach(b => b.classList.remove('active'));
        modalSelectedCount = valor;
    });

    modalCustomCount.addEventListener('blur', () => {
        if (modalCustomCount.value !== '') return;

        // Restaurar botón correspondiente si el input queda vacío
        if (modalSelectedCount === 'all') {
            const allBtn = modalCountSelector.querySelector('.count-btn[data-count="all"]');
            if (allBtn) allBtn.classList.add('active');
        } else {
            const matchingBtn = Array.from(modalCountSelector.querySelectorAll('.count-btn'))
                .find(b => parseInt(b.dataset.count, 10) === modalSelectedCount);
            if (matchingBtn) matchingBtn.classList.add('active');
        }
    });

    // --- Atajos de teclado ---
    document.addEventListener('keydown', (e) => {
        // Ignorar si el foco está en un select o input
        if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
        if (e.ctrlKey || e.altKey || e.metaKey) return;

        // --- Escape: cerrar modal si está abierto ---
        if (e.key === 'Escape' && continueModal.style.display === 'flex') {
            closeContinueModal();
            return;
        }

        // --- Backspace: volver al setup (solo desde el quiz) ---
        if (e.key === 'Backspace') {
            if (screenQuiz.classList.contains('active')) {
                e.preventDefault();
                goBackToSetup();
            }
            return;
        }

        // El resto de atajos solo funcionan en la pantalla del cuestionario
        if (!screenQuiz.classList.contains('active')) return;

        // Navegación
        if (e.key === 'ArrowLeft') {
            goToPrev();
            return;
        }
        if (e.key === 'ArrowRight') {
            goToNext();
            return;
        }

        // Respuesta por letra A-E
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
            if (!simulacroState.isLocked[idx]) window.handleSimulacroAnswer(idx, tecla);
        }
    });

    // ============================================================
    // 14. ARRANQUE
    // ============================================================
    loadData();

})();