// dominio.js — Sistema de repetición espaciada (SM-2 simplificado)
(function () {
    'use strict';

    const STORAGE_KEY = 'qbank_dominio_v1';
    const VERSION = 1;

    // ---- SM-2 constants ----
    const DIA_MS = 86400000;
    const MINUTO_MS = 60000;
    const INTERVALOS_BASE = [1, 3, 7, 21, 60];
    const FACILIDAD_DEFAULT = 2.5;
    const FACILIDAD_MIN = 1.3;
    const FACILIDAD_MAX = 3.0;

    let cache = null;
    let dirty = false;

    // ---- Migración de registros antiguos ----
    function migrarRegistro(e) {
        if (!e) return e;
        if (e.intervalo != null && e.proximoRepaso != null) return e;

        e.facilidad = e.facilidad || FACILIDAD_DEFAULT;
        e.racha = e.racha || 0;

        if (e.estado === 'dominada') {
            e.intervalo = 1;
            e.repeticiones = 1;
            e.proximoRepaso = (e.ultimaVez || Date.now()) + DIA_MS;
        } else if (e.estado === 'dudosa' || e.estado === 'fallada') {
            e.intervalo = 1;
            e.repeticiones = 0;
            e.proximoRepaso = 0;
        } else {
            e.intervalo = 0;
            e.repeticiones = 0;
            e.proximoRepaso = 0;
        }
        return e;
    }

    function cargar() {
        if (cache !== null) return cache;

        let raw;
        try { raw = localStorage.getItem(STORAGE_KEY); } catch (err) { cache = {}; return cache; }
        if (!raw) { cache = {}; return cache; }

        try {
            const data = JSON.parse(raw);
            if (!data || data.version !== VERSION || typeof data.preguntas !== 'object') {
                cache = {};
                return cache;
            }
            cache = data.preguntas || {};
            for (const k in cache) cache[k] = migrarRegistro(cache[k]);
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

    // ---- Núcleo SM-2 ----
    function aplicarSM2(e, acierto, dudaba, ahora) {
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
            // Fallo: re-mostrar en 10 min (misma sesión si el usuario vuelve a filtros)
            e.proximoRepaso = ahora + 10 * MINUTO_MS;
        }
    }

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

        registrarIntento(id, acierto, dudaba) {
            const k = clave(id);
            const db = cargar();
            const ahora = Date.now();
            const e = db[k] || {
                estado: 'fallada', aciertos: 0, fallos: 0, dudas: 0,
                ultimaVez: 0, intervalo: 0, facilidad: FACILIDAD_DEFAULT,
                repeticiones: 0, proximoRepaso: 0, racha: 0
            };

            e.sinDatos = false;
            e.ultimaVez = ahora;

            if (acierto) e.aciertos = (e.aciertos || 0) + 1;
            else          e.fallos  = (e.fallos  || 0) + 1;
            if (dudaba)   e.dudas   = (e.dudas   || 0) + 1;

            aplicarSM2(e, acierto, dudaba, ahora);

            db[k] = e;
            cache = db;
            dirty = true;
            guardar();
        },

        marcarDudosa(id) {
            const k = clave(id);
            const db = cargar();
            const ahora = Date.now();
            const e = db[k] || {
                estado: 'dudosa', aciertos: 0, fallos: 0, dudas: 0,
                ultimaVez: 0, intervalo: 1, facilidad: FACILIDAD_DEFAULT,
                repeticiones: 0, proximoRepaso: 0, racha: 0
            };

            e.sinDatos = false;
            e.ultimaVez = ahora;
            e.estado = 'dudosa';
            e.dudas = (e.dudas || 0) + 1;
            e.racha = 0;
            e.repeticiones = Math.max(0, (e.repeticiones || 0) - 1);
            e.facilidad = Math.max(FACILIDAD_MIN, (e.facilidad || FACILIDAD_DEFAULT) - 0.10);
            e.intervalo = Math.max(1, Math.round((e.intervalo || 1) * 0.5));
            e.proximoRepaso = ahora + e.intervalo * DIA_MS;

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

        // ---- SRS API ----
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
            let nuevas = 0, vencidas = 0, proximas = 0;
            for (const k of Object.keys(db)) {
                if (prefix && !k.startsWith(prefix)) continue;
                const e = db[k];
                if (!e || e.sinDatos) continue;
                if ((e.proximoRepaso || 0) <= ahora) vencidas++;
                else proximas++;
            }
            return { nuevas, vencidas, proximas };
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

        getPerfil() { return { ...cargar() }; },

        resetear() {
            cache = {};
            dirty = true;
            guardar();
        }
    };

    window.Dominio = Dominio;

    window.addEventListener('beforeunload', () => { guardar(); });

    const r = Dominio.getResumen();
    console.log(`[Dominio] Cargado. Dominadas: ${r.dominadas}, Dudosas: ${r.dudosas}, Falladas: ${r.falladas} (total ${r.total}).`);
})();