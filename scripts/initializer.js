(() => {
    const features = new Map();

    window.nercone = {
        features,

        register(name, hooks) {
            const feature = { init: null, reinit: null, cleanup: null, ...hooks };
            features.set(name, feature);
            feature.init?.();
            return feature;
        },

        cleanup()   { for (const feature of features.values()) feature.cleanup?.(); },
        reinit(doc) { for (const feature of features.values()) feature.reinit?.(doc); }
    };
})();
