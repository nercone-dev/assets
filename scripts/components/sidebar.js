(() => {
    class Sidebar {
        static DEFAULTS = {
            selector: '.sidebar',
            media:    '(max-width: 768px)'
        };

        constructor(options = {}) {
            this.options = { ...Sidebar.DEFAULTS, ...options };
            this.abortController = null;
        }

        // Lifecycle
        init() {
            this.update();
            if (this.abortController) return;
            this.abortController = new AbortController();
            const signal = this.abortController.signal;
            document.addEventListener('click', this.onClick, { signal });
            matchMedia(this.options.media).addEventListener('change', this.onMediaChange, { signal });
        }

        cleanup() {
            this.close();
        }

        reinit() {
            this.init();
        }

        destroy() {
            this.abortController?.abort();
            this.abortController = null;
            this.close();
        }

        // Events
        onClick = (event) => {
            // A link inside the popover leads somewhere else, so the popover should not stay over the destination.
            const link = event.target.closest?.('a[href]');
            const sidebar = link?.closest(this.options.selector);
            if (sidebar) Sidebar.hide(sidebar);
        };

        onMediaChange = (event) => {
            // On large screens the sidebar is always shown, so an open popover would only stay in the top layer.
            if (!event.matches) this.close();
        };

        // Control
        update() {
            for (const sidebar of document.querySelectorAll(this.options.selector)) {
                for (const link of sidebar.querySelectorAll('a[href]')) {
                    if (Sidebar.isCurrent(link)) {
                        link.setAttribute('aria-current', 'page');
                        Sidebar.reveal(link, sidebar);
                    } else if (link.getAttribute('aria-current') === 'page') {
                        link.removeAttribute('aria-current');
                    }
                }
            }
        }

        close() {
            for (const sidebar of document.querySelectorAll(this.options.selector)) Sidebar.hide(sidebar);
        }

        // Helpers
        static isCurrent(link) {
            const url = new URL(link.href);
            return url.origin === location.origin && url.pathname === location.pathname && url.search === location.search;
        }

        static reveal(link, sidebar) {
            for (let details = link.closest('details'); details && sidebar.contains(details); details = details.parentElement.closest('details')) {
                details.open = true;
            }
        }

        static hide(sidebar) {
            if (typeof sidebar.hidePopover === 'function' && sidebar.matches(':popover-open')) sidebar.hidePopover();
        }
    }

    window.nercone.Sidebar = Sidebar;
    window.nercone.register('sidebar', new Sidebar());
})();
