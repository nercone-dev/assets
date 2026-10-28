(() => {
    class LoadingOverlay {
        static DEFAULTS = {
            selector: '#loading-overlay',
            easing:   'cubic-bezier(0.125,1,0.25,1)',
            layer:    2,
            duration: {
                in:   3000,
                wait: 1000,
                out:  1000
            }
        };

        constructor(options = {}) {
            this.options = {
                ...LoadingOverlay.DEFAULTS,
                ...options,
                duration: { ...LoadingOverlay.DEFAULTS.duration, ...options.duration }
            };
            this.element = null;
            this.animations = [];
        }

        // Lifecycle
        init() {
            this.element = document.querySelector(this.options.selector);
            if (!this.element) return;
            window.nercone.topLayer.add(this.element, this.options.layer);
            this.play().catch(() => {}).finally(() => this.remove());
        }

        destroy() {
            for (const animation of this.animations) animation.cancel();
            this.remove();
        }

        // Playback
        async play() {
            const svg  = this.element.querySelector('svg');
            const line = this.element.querySelector('polyline');
            if (!svg || !line || matchMedia('(prefers-reduced-motion: reduce)').matches) {
                await this.fadeOut();
                return;
            }

            const { duration } = this.options;
            const length = line.getTotalLength();
            line.style.strokeDasharray  = length;
            line.style.strokeDashoffset = length;

            await Promise.all([
                this.animate(svg, [
                    { opacity: 0, transform: 'scale(1)',   filter: 'blur(20px)' },
                    { opacity: 1, transform: 'scale(0.5)', filter: 'blur(0px)'  }
                ], duration.in),
                this.animate(line, [
                    { strokeDashoffset: length },
                    { strokeDashoffset: 0 }
                ], duration.in)
            ]);

            await new Promise(resolve => setTimeout(resolve, duration.wait));
            if (!this.element) return;

            await Promise.all([
                this.animate(svg, [
                    { opacity: 1, transform: 'scale(0.5)',  filter: 'blur(0px)'  },
                    { opacity: 0, transform: 'scale(0.75)', filter: 'blur(20px)' }
                ], duration.out),
                this.animate(line, [
                    { strokeDashoffset: 0 },
                    { strokeDashoffset: length }
                ], duration.out),
                this.fadeOut()
            ]);
        }

        fadeOut() {
            return this.animate(this.element, [
                { opacity: 1, backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)' },
                { opacity: 0, backdropFilter: 'blur(0px)',  WebkitBackdropFilter: 'blur(0px)'  }
            ], this.options.duration.out);
        }

        animate(target, keyframes, duration) {
            const animation = target.animate(keyframes, { duration, easing: this.options.easing, fill: 'forwards' });
            this.animations.push(animation);
            return animation.finished;
        }

        remove() {
            if (this.element) window.nercone.topLayer.remove(this.element);
            this.element?.remove();
            this.element = null;
            this.animations = [];
        }
    }

    window.nercone.LoadingOverlay = LoadingOverlay;
    window.nercone.register('loading-overlay', new LoadingOverlay());
})();
