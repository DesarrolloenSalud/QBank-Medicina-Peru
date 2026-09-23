(function () {
    'use strict';

    const STORAGE_KEY = 'qbank_dominio_v1';
    const VERSION = 2; // v2: registros con estructura FSRS

    const DIA_MS = 86400000;

    // ---- SM-2 fallback constants ----
    const INTERVALOS_BASE = [1, 3, 7, 21, 60];
    const FACILIDAD_DEFAULT = 2.5;
    const FACILIDAD_MIN = 1.3;
    const FACILIDAD_MAX = 3.0;

    // ------------------------------------------------------------
    // FSRS — inicialización (con fallback)
    // ------------------------------------------------------------
    let fsrsReady = false;
    let scheduler = null;
    let Rating = null;
    let State = null;
    let createEmptyCard = null;

    function initFSRS() {
        const lib = window.tsFsrs || window.TSFSRS || window['ts-fsrs'] || window.FSRS;
        if (!lib) {
            console.warn('[Dominio] ts-fsrs no disponible. Usando fallback SM-2.');
            return false;
        }
        try {
            createEmptyCard = lib.createEmptyCard;
            Rating = lib.Rating;
            State = lib.State;
            scheduler = lib.fsrs({
                request_retention: 0.9,      // 90% de retención objetivo
                maximum_interval: 36500,     // 100 años
                enable_fuzz: true,
                enable_short_term: true,
                learning_steps: ['1m', '10m'],
                relearning_steps: ['10m']
            });
            if (!createEmptyCard || !Rating || !State || !scheduler) {
                console.warn('[Dominio] ts-fsrs incompleto. Usando fallback SM-2.');
                return false;
            }
            fsrsReady = true;
            console.log('[Dominio] FSRS inicializado correctamente.');
            return true;
        } catch (err) {
            console.warn('[Dominio] Error inicializando FSRS:', err);
            return false;
        }
    }

    // ------------------------------------------------------------
    // ESTADO INTERNO
    // ------------------------------------------------------------
    let cache = null;
    let dirty = false;

    // Modo batch: cuando está activo, registrarIntento() y marcarDudosa()
    // NO llaman a guardar(). El llamador debe invocar endBatch() para
    // persistir una sola vez. La mutación de estado (FSRS/SM-2) sigue
    // ocurriendo incondicionalmente en cada llamada — el batching sólo
    // difiere la serialización a localStorage.
    let batching = false;

    // ------------------------------------------------------------
    // MIGRACIÓN v1 (SM-2) → v2 (FSRS)
    // ------------------------------------------------------------
    function migrarRegistro(e) {
        if (!e) return e;
        if (e.stability != null && e.due != null) return e; // ya es FSRS

        const ahora = Date.now();
        const ultima = e.ultimaVez || ahora;

        const oldEstado = e.estado || 'fallada';
        const oldIntervalo = e.intervalo || 0;
        const oldFacilidad = e.facilidad || FACILIDAD_DEFAULT;
        const oldFallos = e.fallos || 0;
        const oldAciertos = e.aciertos || 0;

        // Mapear estado SM-2 → FSRS (0=New, 1=Learning, 2=Review, 3=Relearning)
        let fsrsState;
        if (oldEstado === 'dominada') fsrsState = 2;      // Review
        else if (oldEstado === 'dudosa') fsrsState = 1;   // Learning
        else fsrsState = 3;                               // Relearning

        e.stability = oldIntervalo > 0 ? oldIntervalo : 1;
        const norm = (oldFacilidad - FACILIDAD_MIN) / (FACILIDAD_MAX - FACILIDAD_MIN);
        e.difficulty = Math.round(10 - norm * 9);
        e.elapsed_days = 0;
        e.scheduled_days = oldIntervalo;
        e.reps = oldAciertos + oldFallos;
        e.lapses = oldFallos;
        e.state = fsrsState;
        e.last_review = ultima;
        e.due = (e.proximoRepaso && e.proximoRepaso > 0) ? e.proximoRepaso : ahora;
        e.sinDatos = e.sinDatos || false;

        // Campos de compatibilidad
        e.proximoRepaso = e.due;
        e.intervalo = e.scheduled_days;
        e.facilidad = oldFacilidad;
        e.repeticiones = e.reps;
        e.racha = e.racha || 0;

        return e;
    }

    function cargar() {
        if (cache !== null) return cache;

        let raw;
        try { raw = localStorage.getItem(STORAGE_KEY); } catch (err) { cache = {}; return cache; }
        if (!raw) { cache = {}; return cache; }

        try {
            const data = JSON.parse(raw);
            if (!data || typeof data.preguntas !== 'object') {
                cache = {};
                return cache;
            }
            cache = data.preguntas || {};
            let migrados = 0;
            for (const k in cache) {
                const antes = cache[k];
                const eraV1 = antes && antes.stability == null;
                cache[k] = migrarRegistro(cache[k]);
                if (eraV1 && cache[k] && cache[k].stability != null) migrados++;
            }
            if (migrados > 0) {
                console.log(`[Dominio] ${migrados} registros migrados a FSRS.`);
                dirty = true; // forzar guardado con la nueva estructura
            }
        } catch (err) {
            console.warn('[Dominio] Datos corruptos, se reinicia el perfil.');
            cache = {};
        }
        return cache;
    }

    function guardar() {
        if (!dirty) return;
        try {
            const data = {
                version: VERSION,
                actualizado: Date.now(),
                preguntas: cache || {}
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            dirty = false;
        } catch (err) {
            console.warn('[Dominio] No se pudo guardar el perfil:', err);
        }
    }

    function clave(id) { return String(id); }

    // ------------------------------------------------------------
    // HELPERS FSRS
    // ------------------------------------------------------------
    // Extrae el Card del resultado de scheduler.next().
    // ts-fsrs v4/v5 → RecordLog: { [Rating.X]: { card, log } }
    // Algunas variantes → objeto directo { card, log }
    function extraerCard(result, rating) {
        if (!result) return null;
        if (result[rating] && result[rating].card) return result[rating].card;
        if (result.card) return result.card;
        return null;
    }

    function construirCardFSRS(e, ahora) {
        return {
            due: new Date(e.due || ahora),
            stability: e.stability || 0,
            difficulty: e.difficulty || 0,
            elapsed_days: e.elapsed_days || 0,
            scheduled_days: e.scheduled_days || 0,
            reps: e.reps || 0,
            lapses: e.lapses || 0,
            state: (e.state != null) ? e.state : State.New,
            last_review: e.last_review ? new Date(e.last_review) : undefined
        };
    }

    function volcarCardFSRS(e, nextCard, ahora, rating) {
        e.stability = nextCard.stability;
        e.difficulty = nextCard.difficulty;
        e.elapsed_days = nextCard.elapsed_days;
        e.scheduled_days = nextCard.scheduled_days;
        e.reps = nextCard.reps;
        e.lapses = nextCard.lapses;
        e.state = nextCard.state;
        e.last_review = ahora;
        e.due = nextCard.due.getTime();
        if (rating != null) e._ultimoRating = rating;

        // Campos de compatibilidad
        e.proximoRepaso = e.due;
        e.intervalo = e.scheduled_days;
        e.ultimaVez = ahora;

        // facilidad aproximada para compatibilidad con UI
        e.facilidad = Math.max(FACILIDAD_MIN,
            Math.min(FACILIDAD_MAX,
                FACILIDAD_DEFAULT + (5 - e.difficulty) * 0.2
            )
        );
    }

    // ------------------------------------------------------------
    // NÚCLEO FSRS
    // ------------------------------------------------------------
    // Rating: Again=1, Hard=2, Good=3, Easy=4
    function registrarConFSRS(e, acierto, dudaba, ahora) {
        // Mapear resultado del QBank a Rating FSRS
        let rating;
        if (!acierto) {
            rating = Rating.Again;
        } else if (dudaba) {
            rating = Rating.Hard;
        } else {
            rating = Rating.Good;
        }

        const card = construirCardFSRS(e, ahora);

        let nextCard = null;
        try {
            const result = scheduler.next(card, new Date(ahora), rating);
            nextCard = extraerCard(result, rating);
        } catch (err) {
            console.warn('[Dominio] FSRS.next() falló, se usa SM-2 para este intento:', err);
            nextCard = null;
        }

        if (!nextCard) {
            // Fallback automático a SM-2
            registrarConSM2(e, acierto, dudaba, ahora);
            return;
        }

        volcarCardFSRS(e, nextCard, ahora, rating);

        // Estado legible derivado del resultado FSRS
        if (rating === Rating.Again) {
            e.estado = 'fallada';
        } else if (rating === Rating.Hard) {
            e.estado = 'dudosa';
        } else {
            // Good o Easy → dominada si entró en Review, si no dudosa
            e.estado = (nextCard.state === State.Review) ? 'dominada' : 'dudosa';
        }

        // racha: aciertos consecutivos sin fallo
        if (acierto) e.racha = (e.racha || 0) + 1;
        else e.racha = 0;
    }

    // ------------------------------------------------------------
    // NÚCLEO SM-2 (fallback)
    // ------------------------------------------------------------
    function registrarConSM2(e, acierto, dudaba, ahora) {
        if (acierto && !dudaba) {
            e.racha = (e.racha || 0) + 1;
            e.repeticiones = (e.repeticiones || 0) + 1;
            e.facilidad = Math.min(FACILIDAD_MAX, (e.facilidad || FACILIDAD_DEFAULT) + 0.10);
            const r = e.repeticiones;
            if (r <= INTERVALOS_BASE.length) {
                e.intervalo = INTERVALOS_BASE[r - 1];
            } else {
                e.intervalo = Math.round((e.intervalo || 1) * e.facilidad);
            }
            e.estado = 'dominada';
            e.proximoRepaso = ahora + e.intervalo * DIA_MS;
        } else if (acierto && dudaba) {
            e.racha = 0;
            e.repeticiones = Math.max(0, (e.repeticiones || 0) - 1);
            e.facilidad = Math.max(FACILIDAD_MIN, (e.facilidad || FACILIDAD_DEFAULT) - 0.15);
            e.intervalo = Math.max(1, Math.round((e.intervalo || 1) * 0.5));
            e.estado = 'dudosa';
            e.proximoRepaso = ahora + e.intervalo * DIA_MS;
        } else {
            e.racha = 0;
            e.repeticiones = 0;
            e.facilidad = Math.max(FACILIDAD_MIN, (e.facilidad || FACILIDAD_DEFAULT) - 0.20);
            e.intervalo = 1;
            e.estado = 'fallada';
            e.proximoRepaso = ahora + 10 * 60000;
        }
        e.ultimaVez = ahora;

        // Sincronizar campos FSRS para mantener consistencia si en el futuro
        // se reactiva FSRS o se leen desde getFsrsInfo()
        e.due = e.proximoRepaso;
        e.scheduled_days = e.intervalo;
        e.last_review = ahora;
    }

    // ------------------------------------------------------------
    // API PÚBLICA
    // ------------------------------------------------------------
    const Dominio = {

        getEstado(id) {
            const e = cargar()[clave(id)];
            if (!e || e.sinDatos) return null;
            return e.estado || null;
        },

        getInfo(id) {
            const e = cargar()[clave(id)];
            if (!e || e.sinDatos) return null;
            return { ...e };
        },

        // ---- BATCH MODE ----
        // beginBatch()/endBatch() sólo difieren la serialización a localStorage.
        // La lógica FSRS/SM-2 dentro de registrarIntento() y marcarDudosa()
        // se ejecuta incondicionalmente en cada llamada — sin cambios.
        // Uso:
        //   Dominio.beginBatch();
        //   try { /* N llamadas a registrarIntento */ }
        //   finally { Dominio.endBatch(); }
        beginBatch() { batching = true; },
        endBatch() {
            batching = false;
            if (dirty) guardar();
        },

        registrarIntento(id, acierto, dudaba) {
            const k = clave(id);
            const db = cargar();
            const ahora = Date.now();
            const e = db[k] || {
                estado: 'fallada', aciertos: 0, fallos: 0, dudas: 0,
                ultimaVez: 0, intervalo: 0, facilidad: FACILIDAD_DEFAULT,
                repeticiones: 0, proximoRepaso: 0, racha: 0,
                // Campos FSRS
                due: 0, stability: 0, difficulty: 0, elapsed_days: 0,
                scheduled_days: 0, reps: 0, lapses: 0, state: 0, last_review: 0
            };

            e.sinDatos = false;
            e.ultimaVez = ahora;

            if (acierto) e.aciertos = (e.aciertos || 0) + 1;
            else          e.fallos  = (e.fallos  || 0) + 1;
            if (dudaba)   e.dudas   = (e.dudas   || 0) + 1;

            // LÓGICA FSRS/SM-2 — siempre se ejecuta (mutación de estado).
            if (fsrsReady) {
                registrarConFSRS(e, acierto, dudaba, ahora);
            } else {
                registrarConSM2(e, acierto, dudaba, ahora);
            }

            db[k] = e;
            cache = db;
            dirty = true;

            // PERSISTENCIA — diferida en modo batch.
            if (!batching) guardar();
        },

        marcarDudosa(id) {
            const k = clave(id);
            const db = cargar();
            const ahora = Date.now();
            const e = db[k] || {
                estado: 'dudosa', aciertos: 0, fallos: 0, dudas: 0,
                ultimaVez: 0, intervalo: 1, facilidad: FACILIDAD_DEFAULT,
                repeticiones: 0, proximoRepaso: 0, racha: 0,
                due: 0, stability: 0, difficulty: 0, elapsed_days: 0,
                scheduled_days: 0, reps: 0, lapses: 0, state: 0, last_review: 0
            };

            e.sinDatos = false;
            e.ultimaVez = ahora;
            e.dudas = (e.dudas || 0) + 1;
            e.racha = 0;

            if (fsrsReady) {
                // "Ya la entiendo" → Rating.Hard (recuperó, pero con esfuerzo)
                const card = construirCardFSRS(e, ahora);
                let nextCard = null;
                try {
                    const result = scheduler.next(card, new Date(ahora), Rating.Hard);
                    nextCard = extraerCard(result, Rating.Hard);
                } catch (err) {
                    console.warn('[Dominio] FSRS.next() (marcarDudosa) falló:', err);
                    nextCard = null;
                }

                if (nextCard) {
                    volcarCardFSRS(e, nextCard, ahora, Rating.Hard);
                    e.estado = 'dudosa';
                } else {
                    // Fallback SM-2 si FSRS falla
                    e.estado = 'dudosa';
                    e.repeticiones = Math.max(0, (e.repeticiones || 0) - 1);
                    e.facilidad = Math.max(FACILIDAD_MIN, (e.facilidad || FACILIDAD_DEFAULT) - 0.10);
                    e.intervalo = Math.max(1, Math.round((e.intervalo || 1) * 0.5));
                    e.proximoRepaso = ahora + e.intervalo * DIA_MS;
                    e.due = e.proximoRepaso;
                    e.scheduled_days = e.intervalo;
                    e.last_review = ahora;
                }
            } else {
                e.estado = 'dudosa';
                e.repeticiones = Math.max(0, (e.repeticiones || 0) - 1);
                e.facilidad = Math.max(FACILIDAD_MIN, (e.facilidad || FACILIDAD_DEFAULT) - 0.10);
                e.intervalo = Math.max(1, Math.round((e.intervalo || 1) * 0.5));
                e.proximoRepaso = ahora + e.intervalo * DIA_MS;
                e.due = e.proximoRepaso;
                e.scheduled_days = e.intervalo;
                e.last_review = ahora;
            }

            db[k] = e;
            cache = db;
            dirty = true;

            if (!batching) guardar();
        },

        getIdsPorEstado(estado) {
            const db = cargar();
            const out = [];
            for (const k of Object.keys(db)) {
                const e = db[k];
                if (!e || e.sinDatos) continue;
                if (e.estado === estado) out.push(k);
            }
            return out;
        },

        getResumen(prefix) {
            const db = cargar();
            let dominadas = 0, dudosas = 0, falladas = 0, total = 0;
            for (const k of Object.keys(db)) {
                if (prefix && !k.startsWith(prefix)) continue;
                const e = db[k];
                if (!e || e.sinDatos) continue;
                total++;
                if (e.estado === 'dominada') dominadas++;
                else if (e.estado === 'dudosa') dudosas++;
                else if (e.estado === 'fallada') falladas++;
            }
            return { dominadas, dudosas, falladas, total };
        },

        // Agrega en UNA SOLA PASADA por el cache los prefijos indicados.
        // Cada prefijo tiene la forma "srcId:" (ej: "conareme-2023:").
        // Extrae el prefijo desde la clave "srcId:numero" vía indexOf(':').
        // Retorna el mismo shape que getResumen().
        getResumenMulti(prefijos) {
            const out = { dominadas: 0, dudosas: 0, falladas: 0, total: 0 };
            if (!Array.isArray(prefijos) || prefijos.length === 0) return out;

            const set = new Set(prefijos.map(p => String(p)));
            const db = cargar();

            for (const k of Object.keys(db)) {
                const idx = k.indexOf(':');
                if (idx < 0) continue;
                const pref = k.slice(0, idx + 1);
                if (!set.has(pref)) continue;

                const e = db[k];
                if (!e || e.sinDatos) continue;
                out.total++;
                if (e.estado === 'dominada') out.dominadas++;
                else if (e.estado === 'dudosa') out.dudosas++;
                else if (e.estado === 'fallada') out.falladas++;
            }
            return out;
        },

        getVencidas(prefix, ahora = Date.now()) {
            const db = cargar();
            const out = new Set();
            for (const k of Object.keys(db)) {
                if (prefix && !k.startsWith(prefix)) continue;
                const e = db[k];
                if (!e || e.sinDatos) continue;
                if ((e.proximoRepaso || 0) <= ahora) out.add(k);
            }
            return out;
        },

        getResumenVencimiento(prefix, ahora = Date.now()) {
            const db = cargar();
            let vencidas = 0, proximas = 0;
            for (const k of Object.keys(db)) {
                if (prefix && !k.startsWith(prefix)) continue;
                const e = db[k];
                if (!e || e.sinDatos) continue;
                if ((e.proximoRepaso || 0) <= ahora) vencidas++;
                else proximas++;
            }
            return { vencidas, proximas };
        },

        getProximoRepaso(id) {
            const e = cargar()[clave(id)];
            return e ? (e.proximoRepaso || 0) : 0;
        },

        getIntervalo(id) {
            const e = cargar()[clave(id)];
            return e ? (e.intervalo || 0) : 0;
        },

        getRacha(id) {
            const e = cargar()[clave(id)];
            return e ? (e.racha || 0) : 0;
        },

        // Info extendida de FSRS (para UI futura)
        getFsrsInfo(id) {
            const e = cargar()[clave(id)];
            if (!e || e.sinDatos) return null;
            return {
                stability: e.stability || 0,
                difficulty: e.difficulty || 0,
                elapsed_days: e.elapsed_days || 0,
                scheduled_days: e.scheduled_days || 0,
                reps: e.reps || 0,
                lapses: e.lapses || 0,
                state: e.state,
                due: e.due,
                last_review: e.last_review
            };
        },

        isFsrsReady() { return fsrsReady; },

        getPerfil() { return { ...cargar() }; },

        resetear() {
            cache = {};
            dirty = true;
            guardar();
        }
    };

    // ------------------------------------------------------------
    // INICIALIZACIÓN
    // ------------------------------------------------------------
    initFSRS();

    window.Dominio = Dominio;

    window.addEventListener('beforeunload', () => { guardar(); });

    const r = Dominio.getResumen();
    console.log(`[Dominio] Cargado (${fsrsReady ? 'FSRS' : 'SM-2 fallback'}). Dominadas: ${r.dominadas}, Dudosas: ${r.dudosas}, Falladas: ${r.falladas} (total ${r.total}).`);
})();