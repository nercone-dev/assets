(() => {
    class Nercone {
        constructor() {
            this.features = new Map();
            this.navigator = null;
        }

        // Features
        register(name, feature) {
            this.unregister(name);
            this.features.set(name, feature);
            Nercone.whenReady(() => {
                if (this.features.get(name) === feature) Nercone.call(name, feature, 'init');
            });
            return feature;
        }

        unregister(name) {
            const feature = this.features.get(name);
            if (!feature) return;
            this.features.delete(name);
            Nercone.stop(name, feature);
        }

        get(name) {
            return this.features.get(name) ?? null;
        }

        cleanup() {
            for (const [name, feature] of this.features) Nercone.call(name, feature, 'cleanup');
        }

        reinit(doc) {
            for (const [name, feature] of this.features) Nercone.call(name, feature, 'reinit', doc);
        }

        // Navigation
        setNavigator(navigator) {
            if (this.navigator) Nercone.stop('navigator', this.navigator);
            this.navigator = navigator;
            Nercone.whenReady(() => {
                if (this.navigator === navigator) Nercone.call('navigator', navigator, 'init');
            });
        }

        navigate(href) {
            if (this.navigator) this.navigator.navigate(href);
            else location.assign(href);
        }

        // Helpers
        static call(name, feature, hook, ...args) {
            if (typeof feature[hook] !== 'function') return;
            try {
                feature[hook](...args);
            } catch (error) {
                console.error(`[nercone] ${name}.${hook}() failed:`, error);
            }
        }

        static stop(name, feature) {
            Nercone.call(name, feature, typeof feature.destroy === 'function' ? 'destroy' : 'cleanup');
        }

        static whenReady(callback) {
            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', callback, { once: true });
            else callback();
        }
    }

    class TopLayer {
        // Keeps elements above everything else in the top layer, such as modal dialogs and popovers,
        // which are drawn above any z-index. Elements with a larger order are drawn above smaller ones.
        constructor() {
            this.elements = new Map();
            this.abortController = null;
        }

        static isSupported() {
            return typeof HTMLElement.prototype.showPopover === 'function';
        }

        add(element, order = 0) {
            if (!TopLayer.isSupported()) return;
            element.popover = 'manual';
            this.elements.set(element, order);
            if (!this.abortController) {
                this.abortController = new AbortController();
                document.addEventListener('toggle', this.onToggle, { capture: true, signal: this.abortController.signal });
            }
            this.raise();
        }

        remove(element) {
            if (!this.elements.delete(element)) return;
            if (TopLayer.isOpen(element)) element.hidePopover();
            if (this.elements.size > 0) return;
            this.abortController.abort();
            this.abortController = null;
        }

        raise() {
            const elements = [...this.elements].sort((a, b) => a[1] - b[1]).map(([element]) => element);
            for (const element of elements) {
                if (!element.isConnected) {
                    this.elements.delete(element);
                    continue;
                }
                // Showing a popover again moves it to the top of the top layer.
                if (TopLayer.isOpen(element)) element.hidePopover();
                element.showPopover();
            }
        }

        onToggle = (event) => {
            // <details> also fires toggle, but only modal dialogs and popovers enter the top layer.
            const target = event.target;
            if (event.newState !== 'open' || this.elements.has(target) || !TopLayer.isInTopLayer(target)) return;
            this.raise();
        };

        static isOpen(element) {
            return element.matches(':popover-open');
        }

        static isInTopLayer(element) {
            return element.matches(':modal, :popover-open');
        }
    }

    window.nercone ??= new Nercone();
    window.nercone.Nercone = Nercone;
    window.nercone.TopLayer = TopLayer;
    window.nercone.topLayer ??= new TopLayer();
})();
