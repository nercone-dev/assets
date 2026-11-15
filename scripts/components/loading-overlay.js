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
            this.play().catch(LoadingOverlay.onPlayError).finally(() => this.remove());
        }

        destroy() {
            for (const animation of this.animations) animation.cancel();
            this.remove();
        }

        static onPlayError(error) {
            // destroy() cancels the animations, which rejects their finished promises with an AbortError.
            if (error?.name !== 'AbortError') console.error('[nercone] loading-overlay.play() failed:', error);
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
            const vertices = Array.from(line.points, ({ x, y }) => ({ x, y }));
            line.setAttribute('points', LoadingOverlay.tracePoints(vertices, 0));

            await Promise.all([
                this.animate(svg, [
                    { opacity: 0, transform: 'scale(1)',   filter: 'blur(20px)' },
                    { opacity: 1, transform: 'scale(0.5)', filter: 'blur(0px)'  }
                ], duration.in),
                this.trace(line, vertices, 0, 1, duration.in)
            ]);

            await new Promise(resolve => setTimeout(resolve, duration.wait));
            if (!this.element) return;

            await Promise.all([
                this.animate(svg, [
                    { opacity: 1, transform: 'scale(0.5)',  filter: 'blur(0px)'  },
                    { opacity: 0, transform: 'scale(0.75)', filter: 'blur(20px)' }
                ], duration.out),
                this.trace(line, vertices, 1, 0, duration.out),
                this.fadeOut()
            ]);
        }

        // Moves the end of the polyline along its vertices from one ratio of its length to another, like placing points with a pen tool.
        // The fill closes the shape back to the first vertex at every step.
        trace(line, vertices, from, to, duration) {
            const animation = line.animate([], { duration, easing: this.options.easing, fill: 'forwards' });
            this.animations.push(animation);

            const update = () => {
                const { progress } = animation.effect.getComputedTiming();
                if (progress === null) return;
                line.setAttribute('points', LoadingOverlay.tracePoints(vertices, from + (to - from) * progress));
            };
            const step = () => {
                update();
                if (animation.playState === 'running') requestAnimationFrame(step);
            };
            requestAnimationFrame(step);

            return animation.finished.then(update);
        }

        // Returns the points attribute for the part of a polyline that covers the given ratio (0 to 1) of its total length from the first vertex.
        static tracePoints(vertices, ratio) {
            const lengths = [];
            let total = 0;
            for (let i = 1; i < vertices.length; i++) {
                const length = Math.hypot(vertices[i].x - vertices[i - 1].x, vertices[i].y - vertices[i - 1].y);
                lengths.push(length);
                total += length;
            }

            let remaining = total * window.nercone.Numbers.clamp(ratio, 0, 1);
            const points = vertices.length ? [vertices[0]] : [];
            for (let i = 1; i < vertices.length; i++) {
                const length = lengths[i - 1];
                if (remaining >= length) {
                    points.push(vertices[i]);
                    remaining -= length;
                    continue;
                }
                if (remaining > 0) {
                    const t = remaining / length;
                    points.push({
                        x: vertices[i - 1].x + (vertices[i].x - vertices[i - 1].x) * t,
                        y: vertices[i - 1].y + (vertices[i].y - vertices[i - 1].y) * t
                    });
                }
                break;
            }
            return points.map(({ x, y }) => `${x} ${y}`).join(' ');
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
