(() => {
    class Popup {
        static DEFAULTS = {
            selector:       '.popup',
            openAttribute:  'data-popup-open',
            closeAttribute: 'data-popup-close'
        };

        constructor(options = {}) {
            this.options = { ...Popup.DEFAULTS, ...options };
            this.abortController = null;
        }

        // Lifecycle
        init() {
            if (this.abortController) return;
            this.abortController = new AbortController();
            document.addEventListener('click', this.onClick, { signal: this.abortController.signal });
        }

        cleanup() {
            for (const popup of document.querySelectorAll(`${this.options.selector}[open]`)) popup.close();
        }

        reinit() {
            this.init();
        }

        destroy() {
            this.abortController?.abort();
            this.abortController = null;
            this.cleanup();
        }

        // Events
        onClick = (event) => {
            if (event.defaultPrevented) return;
            const { openAttribute, closeAttribute } = this.options;

            const opener = event.target.closest?.(`[${openAttribute}]`);
            if (opener) {
                if (this.open(opener.getAttribute(openAttribute))) event.preventDefault();
                return;
            }

            const closer = event.target.closest?.(`[${closeAttribute}]`);
            if (closer) {
                const popup = closer.closest('dialog');
                if (popup && this.close(popup, closer.getAttribute(closeAttribute))) event.preventDefault();
                return;
            }

            const popup = event.target;
            if (popup.matches?.(this.options.selector) && Popup.isLightDismissible(popup) && !Popup.contains(popup, event)) this.close(popup);
        };

        // Control
        open(target) {
            const popup = Popup.resolve(target);
            if (!popup || popup.open) return null;
            popup.showModal();
            return popup;
        }

        close(target, returnValue = null) {
            const popup = Popup.resolve(target);
            if (!popup || !popup.open) return null;
            if (returnValue) popup.close(returnValue);
            else popup.close();
            return popup;
        }

        toggle(target) {
            const popup = Popup.resolve(target);
            if (!popup) return null;
            return popup.open ? this.close(popup) : this.open(popup);
        }

        // Helpers
        static resolve(target) {
            const popup = typeof target === 'string' ? document.getElementById(target) : target;
            return popup instanceof HTMLDialogElement ? popup : null;
        }

        static isLightDismissible(popup) {
            // Follows the closedby attribute, for browsers that do not implement it.
            return popup.getAttribute('closedby') === 'any';
        }

        static contains(popup, event) {
            const rect = popup.getBoundingClientRect();
            return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
        }
    }

    window.nercone.Popup = Popup;
    window.nercone.register('popup', new Popup());
})();
