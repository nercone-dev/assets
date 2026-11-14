(() => {
    class Toast {
        static DEFAULTS = {
            position:         'bottom-end',
            duration:         5000,
            limit:            5,
            dismissible:      true,
            label:            'Notifications',
            closeLabel:       'Close',
            triggerAttribute: 'data-toast',
            variantAttribute: 'data-toast-variant',
            layer:            0
        };
        static VARIANTS = ['information', 'success', 'warning', 'error'];
        static URGENT_VARIANTS = ['warning', 'error'];

        constructor(options = {}) {
            this.options = { ...Toast.DEFAULTS, ...options };
            this.container = null;
            this.abortController = null;
            this.timers = new Map();
        }

        // Lifecycle
        init() {
            if (this.abortController) return;
            this.abortController = new AbortController();
            document.addEventListener('click', this.onClick, { signal: this.abortController.signal });
        }

        reinit() {
            this.init();
        }

        destroy() {
            this.abortController?.abort();
            this.abortController = null;
            for (const timer of this.timers.values()) clearTimeout(timer.id);
            this.timers.clear();
            if (this.container) window.nercone.topLayer.remove(this.container);
            this.container?.remove();
            this.container = null;
        }

        // Events
        onClick = (event) => {
            if (event.defaultPrevented) return;
            const { triggerAttribute, variantAttribute } = this.options;
            const trigger = event.target.closest?.(`[${triggerAttribute}]`);
            if (!trigger) return;
            this.show(trigger.getAttribute(triggerAttribute), { variant: trigger.getAttribute(variantAttribute) });
        };

        // Control
        show(message, { variant = null, duration = this.options.duration, dismissible = this.options.dismissible } = {}) {
            const container = this.containerOf();
            const toast = document.createElement('div');
            toast.className = 'toast';
            if (Toast.VARIANTS.includes(variant)) toast.classList.add(`toast-${variant}`);
            if (Toast.URGENT_VARIANTS.includes(variant)) toast.setAttribute('role', 'alert');

            const body = document.createElement('div');
            body.className = 'toast-message';
            body.append(message);
            toast.append(body);

            if (dismissible) {
                const close = document.createElement('button');
                close.className = 'toast-close';
                close.type = 'button';
                close.textContent = '×';
                close.setAttribute('aria-label', this.options.closeLabel);
                close.addEventListener('click', () => this.close(toast));
                toast.append(close);
            }

            if (duration > 0) {
                toast.addEventListener('pointerenter', () => this.pause(toast, 'pointer'));
                toast.addEventListener('pointerleave', () => this.resume(toast, 'pointer'));
                toast.addEventListener('focusin',      () => this.pause(toast, 'focus'));
                toast.addEventListener('focusout',     (event) => {
                    if (!toast.contains(event.relatedTarget)) this.resume(toast, 'focus');
                });
                this.timers.set(toast, { id: 0, remaining: duration, start: 0, holds: new Set() });
                this.resume(toast);
            }

            container.append(toast);
            this.trim();
            return toast;
        }

        async close(toast) {
            if (!toast.isConnected || toast.classList.contains('closing')) return;
            clearTimeout(this.timers.get(toast)?.id);
            this.timers.delete(toast);

            toast.classList.add('closing');
            await Promise.allSettled(toast.getAnimations().map(animation => animation.finished));
            toast.remove();
        }

        clear() {
            if (!this.container) return;
            for (const toast of this.container.querySelectorAll('.toast')) this.close(toast);
        }

        // Timer
        pause(toast, reason = 'manual') {
            const timer = this.timers.get(toast);
            if (!timer) return;
            timer.holds.add(reason);
            if (!timer.id) return;
            clearTimeout(timer.id);
            timer.id = 0;
            timer.remaining -= performance.now() - timer.start;
        }

        resume(toast, reason = 'manual') {
            const timer = this.timers.get(toast);
            if (!timer) return;
            timer.holds.delete(reason);
            if (timer.id || timer.holds.size > 0) return;
            timer.start = performance.now();
            timer.id = setTimeout(() => this.close(toast), Math.max(timer.remaining, 0));
        }

        // Rendering
        containerOf() {
            if (this.container?.isConnected) return this.container;
            const container = document.createElement('section');
            container.className = `toast-container toast-container-${this.options.position}`;
            container.setAttribute('aria-label', this.options.label);
            container.setAttribute('aria-live', 'polite');
            document.body.append(container);
            // In the top layer, toasts stay visible above modal popups.
            window.nercone.topLayer.add(container, this.options.layer);
            this.container = container;
            return container;
        }

        trim() {
            const toasts = [...this.container.querySelectorAll('.toast:not(.closing)')];
            for (const toast of toasts.slice(0, Math.max(toasts.length - this.options.limit, 0))) this.close(toast);
        }
    }

    window.nercone.Toast = Toast;
    window.nercone.register('toast', new Toast());
})();
