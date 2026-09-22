// multiselect.js
// ============================================================
// Componente reutilizable de selección múltiple con buscador.
// Se integra con la cascada de filtros del QBank.
// ============================================================

(function () {
    'use strict';

    /**
     * Crea un MultiSelect dentro de un contenedor.
     * @param {HTMLElement} contenedor
     * @param {object} opts
     *   - placeholder: string
     *   - onChange: (Set<string>) => void
     *   - searchThreshold: number (default 8)
     */
    window.MultiSelect = function (contenedor, opts = {}) {
        const {
            placeholder = 'Todos',
            onChange = () => {},
            searchThreshold = 8
        } = opts;

        let opciones = [];
        let seleccionados = new Set();

        contenedor.classList.add('multiselect');
        contenedor.innerHTML = `
            <button type="button" class="ms-trigger" aria-haspopup="listbox" aria-expanded="false">
                <span class="ms-content"></span>
            </button>
            <div class="ms-popover" role="listbox">
                <input type="text" class="ms-search" placeholder="Buscar..." style="display:none;">
                <div class="ms-options"></div>
                <div class="ms-actions">
                    <button type="button" data-action="all">Todas</button>
                    <button type="button" data-action="none">Ninguna</button>
                </div>
            </div>
        `;

        const trigger   = contenedor.querySelector('.ms-trigger');
        const content   = contenedor.querySelector('.ms-content');
        const popover   = contenedor.querySelector('.ms-popover');
        const search    = contenedor.querySelector('.ms-search');
        const optionsBox = contenedor.querySelector('.ms-options');

        // ---- Render del botón ----
        function renderTrigger() {
            // NUEVO: estado has-value
            contenedor.classList.toggle('has-value', seleccionados.size > 0);

            if (seleccionados.size === 0) {
                content.innerHTML = `<span class="ms-placeholder">${placeholder}</span>`;
                return;
            }
            const arr = [...seleccionados];
            const visibles = arr.slice(0, 2);
            let html = visibles.map(v =>
                `<span class="ms-chip" title="${v}">${v}<span class="ms-x" data-value="${v}">×</span></span>`
            ).join('');
            if (arr.length > 2) {
                html += `<span class="ms-count">+${arr.length - 2}</span>`;
            }
            content.innerHTML = html;
        }

        // ---- Render de opciones ----
        function renderOptions(filtro = '') {
            const f = filtro.trim().toLowerCase();
            const visibles = f
                ? opciones.filter(o => o.toLowerCase().includes(f))
                : opciones;

            if (visibles.length === 0) {
                optionsBox.innerHTML = `<div class="ms-empty">Sin resultados</div>`;
                return;
            }

            optionsBox.innerHTML = visibles.map(op => {
                const checked = seleccionados.has(op);
                const safe = String(op).replace(/"/g, '&quot;');
                return `
                    <label class="ms-option ${checked ? 'checked' : ''}" data-value="${safe}">
                        <input type="checkbox" ${checked ? 'checked' : ''}>
                        <span>${op}</span>
                    </label>
                `;
            }).join('');
        }

        // ---- Abrir/cerrar ----
        function toggleOpen(open) {
            contenedor.classList.toggle('open', open);
            trigger.classList.toggle('open', open);
            trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
            if (open) {
                search.style.display = opciones.length >= searchThreshold ? 'block' : 'none';
                search.value = '';
                renderOptions('');
                if (search.style.display === 'block') {
                    setTimeout(() => search.focus(), 50);
                }
            }
        }

        trigger.addEventListener('click', (e) => {
            if (e.target.classList.contains('ms-x')) return;
            toggleOpen(!contenedor.classList.contains('open'));
        });

        // Quitar chip con la X
        content.addEventListener('click', (e) => {
            if (!e.target.classList.contains('ms-x')) return;
            e.stopPropagation();
            const val = e.target.dataset.value;
            seleccionados.delete(val);
            renderTrigger();
            renderOptions(search.value);
            onChange(new Set(seleccionados));
        });

        // Click en opciones (delegado con cambio)
        optionsBox.addEventListener('change', (e) => {
            const label = e.target.closest('.ms-option');
            if (!label) return;
            const val = label.dataset.value;
            if (e.target.checked) seleccionados.add(val);
            else seleccionados.delete(val);
            label.classList.toggle('checked', e.target.checked);
            renderTrigger();
            onChange(new Set(seleccionados));
        });

        // Buscador
        search.addEventListener('input', () => renderOptions(search.value));
        search.addEventListener('click', (e) => e.stopPropagation());

        // Acciones
        popover.querySelector('[data-action="all"]').addEventListener('click', () => {
            seleccionados = new Set(opciones);
            renderTrigger();
            renderOptions(search.value);
            onChange(new Set(seleccionados));
        });
        popover.querySelector('[data-action="none"]').addEventListener('click', () => {
            seleccionados.clear();
            renderTrigger();
            renderOptions(search.value);
            onChange(new Set(seleccionados));
        });

        // Cerrar al click fuera
        document.addEventListener('click', (e) => {
            if (!contenedor.contains(e.target)) toggleOpen(false);
        });

        // Cerrar con Escape
        contenedor.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') toggleOpen(false);
        });

        // ---- API pública ----
        return {
            setOptions(nuevasOpciones) {
                const set = new Set(nuevasOpciones);
                opciones = [...set].sort((a, b) =>
                    String(a).localeCompare(String(b), 'es')
                );
                for (const v of [...seleccionados]) {
                    if (!set.has(v)) seleccionados.delete(v);
                }
                renderTrigger();
                if (contenedor.classList.contains('open')) renderOptions(search.value);
            },

            getSelected() {
                return new Set(seleccionados);
            },

            setSelected(values) {
                seleccionados = new Set(values);
                renderTrigger();
                if (contenedor.classList.contains('open')) renderOptions(search.value);
            },

            clear() {
                seleccionados.clear();
                renderTrigger();
                if (contenedor.classList.contains('open')) renderOptions(search.value);
            }
        };
    };
})();