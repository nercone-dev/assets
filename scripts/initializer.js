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

    window.nercone ??= new Nercone();
    window.nercone.Nercone = Nercone;
})();
