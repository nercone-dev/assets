(() => {
    class Slider {
        static DEFAULTS = {
            selector: '.slider',
            property: '--slider-value'
        };
        static ATTRIBUTES = ['value', 'min', 'max'];

        constructor(options = {}) {
            this.options = { ...Slider.DEFAULTS, ...options };
            this.observer = null;
            this.abortController = null;
        }

        // Lifecycle
        init() {
            this.updateAll(document);
            if (this.observer) return;

            this.abortController = new AbortController();
            const options = { capture: true, passive: true, signal: this.abortController.signal };
            document.addEventListener('input',  this.onInput, options);
            document.addEventListener('change', this.onInput, options);
            document.addEventListener('reset',  this.onReset, options);

            this.observer = new MutationObserver(this.onMutations);
            this.observer.observe(document.documentElement, {
                subtree:         true,
                childList:       true,
                attributes:      true,
                attributeFilter: Slider.ATTRIBUTES
            });
        }

        reinit() {
            this.init();
        }

        destroy() {
            this.abortController?.abort();
            this.abortController = null;
            this.observer?.disconnect();
            this.observer = null;
        }

        // Events
        onInput = (event) => {
            if (event.target.matches?.(this.options.selector)) this.update(event.target);
        };

        onReset = (event) => {
            // Form reset restores values after the event, without firing input or change.
            const form = event.target;
            setTimeout(() => this.updateAll(form));
        };

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
            const ratio = Slider.ratioOf(element);
            if (ratio === null) element.style.removeProperty(this.options.property);
            else element.style.setProperty(this.options.property, ratio);
        }

        static ratioOf(element) {
            const value = element.valueAsNumber;
            const min = Slider.parseNumber(element.min, 0);
            const max = Slider.parseNumber(element.max, 100);
            if (!Number.isFinite(value) || max <= min) return null;
            return Math.min(Math.max((value - min) / (max - min), 0), 1);
        }

        static parseNumber(value, fallback) {
            if (value === null || value.trim() === '') return fallback;
            const number = Number(value);
            return Number.isFinite(number) ? number : fallback;
        }
    }

    window.nercone.Slider = Slider;
    window.nercone.register('slider', new Slider());
})();
