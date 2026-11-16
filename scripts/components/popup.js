(() => {
    class Popup {
        static DEFAULTS = {
            selector:       '.popup, dialog',
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
            for (const popup of document.querySelectorAll(this.options.selector)) if (popup.open) popup.close();
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

            // Browsers with invoker commands run commandfor and command themselves, without JavaScript.
            const invoker = Popup.isCommandSupported() ? null : event.target.closest?.('button[commandfor][command]');
            if (invoker) {
                if (this.invoke(invoker)) event.preventDefault();
                return;
            }

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
            if (popup.matches?.(this.options.selector) && Popup.isLightDismissible(popup) && !Popup.isPointInside(popup, event.clientX, event.clientY)) this.close(popup);
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

        // Runs the command of BUTTON (command="show-modal", "close" or "request-close") on the dialog named by its commandfor,
        // as browsers with invoker commands do. Returns the dialog, or null when nothing changed.
        invoke(button) {
            // A submit or reset button in a form does that instead of its command.
            if (button.disabled || (button.form && button.type !== 'button')) return null;
            const popup = Popup.resolve(button.getAttribute('commandfor'));
            if (!popup) return null;
            switch (button.getAttribute('command').toLowerCase()) {
                case 'show-modal':
                    return this.open(popup);
                case 'close':
                    return this.close(popup, button.value);
                case 'request-close':
                    // requestClose() fires cancel, which can keep the dialog open; close() would skip it, so it is not used instead.
                    if (!popup.open || typeof popup.requestClose !== 'function') return null;
                    if (button.value) popup.requestClose(button.value);
                    else popup.requestClose();
                    return popup;
                default:
                    return null;
            }
        }

        // Helpers
        static isCommandSupported() {
            return 'command' in HTMLButtonElement.prototype;
        }

        static resolve(target) {
            const popup = typeof target === 'string' ? document.getElementById(target) : target;
            return popup instanceof HTMLDialogElement ? popup : null;
        }

        static isLightDismissible(popup) {
            // Follows the closedby attribute, for browsers that do not implement it.
            return popup.getAttribute('closedby') === 'any';
        }

        static isPointInside(element, x, y) {
            const rect = element.getBoundingClientRect();
            return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
        }
    }

    window.nercone.Popup = Popup;
    window.nercone.register('popup', new Popup());
})();
