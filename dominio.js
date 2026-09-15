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
// Los IDs ahora incluyen el prefijo del banco ("residencia:1", "enam:42").
// Esto permite que el mismo número de pregunta en distintos bancos NO
// se mezcle en el perfil de dominio.
//
// API pública (window.Dominio):
//   Dominio.getEstado(id)                    → estado | null
//   Dominio.getInfo(id)                      → { estado, aciertos, fallos, dudas, ultimaVez } | null
//   Dominio.registrarIntento(id, acierto, dudaba) → void
//   Dominio.marcarDudosa(id)                 → void
//   Dominio.getIdsPorEstado(estado)          → number[]
//   Dominio.getResumen(prefix?)              → { dominadas, dudosas, falladas, total }
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
        return String(id);
    }

    // ------------------------------------------------------------
    // API PÚBLICA
    // ------------------------------------------------------------
    const Dominio = {

        getEstado(id) {
            const k = clave(id);
            const db = cargar();
            const e = db[k];
            if (!e || e.sinDatos) return null;
            return e.estado || null;
        },

        getInfo(id) {
            const k = clave(id);
            const db = cargar();
            const e = db[k];
            if (!e || e.sinDatos) return null;
            return { ...e };
        },

        registrarIntento(id, acierto, dudaba) {
            const k = clave(id);
            const db = cargar();
            const e = db[k] || { estado: 'fallada', aciertos: 0, fallos: 0, dudas: 0, ultimaVez: 0 };

            e.sinDatos = false;
            e.ultimaVez = Date.now();

            if (acierto) {
                e.aciertos = (e.aciertos || 0) + 1;
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

        /**
         * Resumen de los 3 estados.
         * @param {string} [prefix] Filtra sólo las claves que comienzan con ese prefijo.
         *                          Ej: "residencia:" para contar sólo ese banco.
         */
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

        getPerfil() {
            return { ...cargar() };
        },

        resetear() {
            cache = {};
            dirty = true;
            guardar();
        }
    };

    window.Dominio = Dominio;

    window.addEventListener('beforeunload', () => {
        guardar();
    });

    const r = Dominio.getResumen();
    console.log(`[Dominio] Cargado. Dominadas: ${r.dominadas}, Dudosas: ${r.dudosas}, Falladas: ${r.falladas} (total ${r.total}).`);
})();