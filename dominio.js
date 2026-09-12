// ============================================================
// dominio.js
// ============================================================
// Módulo de persistencia del "perfil de dominio" por pregunta.
//
// Estados:
//   - "dominada"  🟢 → Acierto sin flag previo.
//   - "dudosa"    🟡 → Acierto con flag, o "Ya la entiendo" en revisión.
//   - "fallada"   🔴 → Fallo, o "Aún dudo" en revisión.
//
// Cada pregunta registra:
//   - aciertos: int
//   - fallos:   int
//   - dudas:    int  (veces que se marcó flag o se dijo "Aún dudo")
//   - ultimaVez: timestamp
//   - estado:   "dominada" | "dudosa" | "fallada"
//
// API pública (window.Dominio):
//   Dominio.getEstado(id)                    → estado | null
//   Dominio.getInfo(id)                      → { estado, aciertos, fallos, dudas, ultimaVez } | null
//   Dominio.registrarIntento(id, acierto, dudaba) → void
//   Dominio.marcarDudosa(id)                 → void  (usado por "Ya la entiendo" o "Aún dudo")
//   Dominio.getIdsPorEstado(estado)          → number[]
//   Dominio.getResumen()                     → { dominadas, dudosas, falladas, total }
//   Dominio.getPerfil()                      → objeto crudo para el setup
//   Dominio.resetear()                       → void
// ============================================================

(function () {
    'use strict';

    const STORAGE_KEY = 'qbank_dominio_v1';
    const VERSION = 1;

    // ------------------------------------------------------------
    // ESTADO INTERNO
    // ------------------------------------------------------------
    // estructura: { [preguntaId]: { estado, aciertos, fallos, dudas, ultimaVez } }
    let cache = null;
    let dirty = false;

    // ------------------------------------------------------------
    // PERSISTENCIA
    // ------------------------------------------------------------
    function cargar() {
        if (cache !== null) return cache;

        let raw;
        try {
            raw = localStorage.getItem(STORAGE_KEY);
        } catch (err) {
            cache = {};
            return cache;
        }
        if (!raw) {
            cache = {};
            return cache;
        }

        try {
            const data = JSON.parse(raw);
            if (!data || data.version !== VERSION || typeof data.preguntas !== 'object') {
                cache = {};
                return cache;
            }
            cache = data.preguntas || {};
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

    // ------------------------------------------------------------
    // HELPERS
    // ------------------------------------------------------------
    function clave(id) {
        // Acepta números o strings; normaliza a string.
        return String(id);
    }

    function asegurarEntrada(id) {
        const k = clave(id);
        const db = cargar();
        if (!db[k]) {
            db[k] = {
                estado: 'fallada',   // por defecto, sin datos se considera fallada hasta primer acierto
                aciertos: 0,
                fallos: 0,
                dudas: 0,
                ultimaVez: 0,
                sinDatos: true       // se limpia al primer registro real
            };
        }
        return db[k];
    }

    // ------------------------------------------------------------
    // API PÚBLICA
    // ------------------------------------------------------------
    const Dominio = {

        /** Devuelve el estado ("dominada" | "dudosa" | "fallada") o null si no hay datos. */
        getEstado(id) {
            const k = clave(id);
            const db = cargar();
            const e = db[k];
            if (!e || e.sinDatos) return null;
            return e.estado || null;
        },

        /** Devuelve la info completa o null si no hay datos. */
        getInfo(id) {
            const k = clave(id);
            const db = cargar();
            const e = db[k];
            if (!e || e.sinDatos) return null;
            return { ...e };
        },

        /**
         * Registra un intento en la pregunta.
         * @param {number|string} id
         * @param {boolean} acierto
         * @param {boolean} dudaba  - true si el usuario la marcó con flag
         */
        registrarIntento(id, acierto, dudaba) {
            const k = clave(id);
            const db = cargar();
            const e = db[k] || { estado: 'fallada', aciertos: 0, fallos: 0, dudas: 0, ultimaVez: 0 };

            e.sinDatos = false;
            e.ultimaVez = Date.now();

            if (acierto) {
                e.aciertos = (e.aciertos || 0) + 1;
                // D2=a: si dudaba al responder → dudosa. Si no → dominada.
                e.estado = dudaba ? 'dudosa' : 'dominada';
            } else {
                e.fallos = (e.fallos || 0) + 1;
                e.estado = 'fallada';
            }

            if (dudaba) {
                e.dudas = (e.dudas || 0) + 1;
            }

            db[k] = e;
            cache = db;
            dirty = true;
            guardar();
        },

        /**
         * Marca la pregunta como "dudosa" (usado por P7 en revisión).
         * No suma aciertos ni fallos; suma una duda si la pregunta ya era fallada.
         */
        marcarDudosa(id) {
            const k = clave(id);
            const db = cargar();
            const e = db[k] || { estado: 'dudosa', aciertos: 0, fallos: 0, dudas: 0, ultimaVez: 0 };

            e.sinDatos = false;
            e.estado = 'dudosa';
            e.dudas = (e.dudas || 0) + 1;
            e.ultimaVez = Date.now();

            db[k] = e;
            cache = db;
            dirty = true;
            guardar();
        },

        /** Devuelve los IDs (como números si el JSON los tiene como números) con el estado dado. */
        getIdsPorEstado(estado) {
            const db = cargar();
            const out = [];
            for (const k of Object.keys(db)) {
                const e = db[k];
                if (!e || e.sinDatos) continue;
                if (e.estado === estado) out.push(k);
            }
            // Los IDs se guardan como string; devolvemos number si es numérico
            return out.map(k => /^\d+$/.test(k) ? parseInt(k, 10) : k);
        },

        /** Devuelve un resumen de los 3 estados. */
        getResumen() {
            const db = cargar();
            let dominadas = 0, dudosas = 0, falladas = 0, total = 0;
            for (const k of Object.keys(db)) {
                const e = db[k];
                if (!e || e.sinDatos) continue;
                total++;
                if (e.estado === 'dominada') dominadas++;
                else if (e.estado === 'dudosa') dudosas++;
                else if (e.estado === 'fallada') falladas++;
            }
            return { dominadas, dudosas, falladas, total };
        },

        /** Devuelve el objeto crudo (para uso interno o debug). */
        getPerfil() {
            return { ...cargar() };
        },

        /** Borra todo el perfil. */
        resetear() {
            cache = {};
            dirty = true;
            guardar();
        }
    };

    // Exponer globalmente
    window.Dominio = Dominio;

    // Guardar automáticamente al cerrar la pestaña
    window.addEventListener('beforeunload', () => {
        guardar();
    });

    // Log inicial para confirmar carga
    const r = Dominio.getResumen();
    console.log(`[Dominio] Cargado. Dominadas: ${r.dominadas}, Dudosas: ${r.dudosas}, Falladas: ${r.falladas} (total ${r.total}).`);
})();