(() => {
    class Progress {
        static DEFAULTS = {
            selector: '.progress-linear, .progress-circular, .progress-logo',
            property: '--progress-value',
            min:      0,
            max:      100
        };
        static ATTRIBUTES = ['aria-valuenow', 'aria-valuemin', 'aria-valuemax'];

        constructor(options = {}) {
            this.options = { ...Progress.DEFAULTS, ...options };
            this.observer = null;
        }

        // Lifecycle
        init() {
            this.updateAll(document);
            if (this.observer) return;

            this.observer = new MutationObserver(this.onMutations);
            this.observer.observe(document.documentElement, {
                subtree:         true,
                childList:       true,
                attributes:      true,
                attributeFilter: Progress.ATTRIBUTES
            });
        }

        reinit() {
            this.init();
        }

        destroy() {
            this.observer?.disconnect();
            this.observer = null;
        }

        // Events
        onMutations = (mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes') {
                    if (mutation.target.matches(this.options.selector)) this.update(mutation.target);
                    continue;
                }
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) this.updateAll(node);
                }
            }
        };

        // Rendering
        updateAll(root) {
            if (root.matches?.(this.options.selector)) this.update(root);
            for (const element of root.querySelectorAll(this.options.selector)) this.update(element);
        }

        update(element) {
            const ratio = this.ratioOf(element);
            if (ratio === null) element.style.removeProperty(this.options.property);
            else element.style.setProperty(this.options.property, ratio);
        }

        ratioOf(element) {
            const value = Progress.parseNumber(element.getAttribute('aria-valuenow'), null);
            if (value === null) return null;
            const min = Progress.parseNumber(element.getAttribute('aria-valuemin'), this.options.min);
            const max = Progress.parseNumber(element.getAttribute('aria-valuemax'), this.options.max);
            if (max <= min) return null;
            return Math.min(Math.max((value - min) / (max - min), 0), 1);
        }

        static parseNumber(value, fallback) {
            if (value === null || value.trim() === '') return fallback;
            const number = Number(value);
            return Number.isFinite(number) ? number : fallback;
        }
    }

    window.nercone.Progress = Progress;
    window.nercone.register('progress', new Progress());
})();
