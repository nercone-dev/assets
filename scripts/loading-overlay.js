(() => {
    class LoadingOverlay {
        static EASE = 'cubic-bezier(0.125,1,0.25,1)';
        static PHASE = {
            in:   3000,
            wait: 1000,
            out:  1000
        };

        init() {
            const overlay = document.getElementById('loading-overlay');
            if (!overlay) return;

            const svg = overlay.querySelector('svg');
            const line = overlay.querySelector('polyline');
            if (!svg || !line) { overlay.remove(); return; }

            const length = line.getTotalLength();
            line.style.strokeDasharray = length;
            line.style.strokeDashoffset = length;

            const opts = (d) => ({ duration: d, easing: LoadingOverlay.EASE, fill: 'forwards' });

            svg.animate([
                { opacity: 0, transform: 'scale(1)',   filter: 'blur(20px)' },
                { opacity: 1, transform: 'scale(0.5)', filter: 'blur(0px)'  }
            ], opts(LoadingOverlay.PHASE.in));
            line.animate([
                { strokeDashoffset: length },
                { strokeDashoffset: 0 }
            ], opts(LoadingOverlay.PHASE.in));

            setTimeout(() => {
                svg.animate([
                    { opacity: 1, transform: 'scale(0.5)',  filter: 'blur(0px)'  },
                    { opacity: 0, transform: 'scale(0.75)', filter: 'blur(20px)' }
                ], opts(LoadingOverlay.PHASE.out));

                line.animate([
                    { strokeDashoffset: 0 },
                    { strokeDashoffset: length }
                ], opts(LoadingOverlay.PHASE.out));

                overlay.animate([
                    { opacity: 1, backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)' },
                    { opacity: 0, backdropFilter: 'blur(0px)',  WebkitBackdropFilter: 'blur(0px)'  }
                ], opts(LoadingOverlay.PHASE.out));

                setTimeout(() => overlay.remove(), LoadingOverlay.PHASE.out);
            }, LoadingOverlay.PHASE.in + LoadingOverlay.PHASE.wait);
        }
    }

    const loadingOverlay = new LoadingOverlay();
    window.nercone.register('loading-overlay', { init: () => loadingOverlay.init() });
})();
