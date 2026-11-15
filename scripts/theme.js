(() => {
    class Theme {
        static DEFAULTS = {
            baseURL:          'https://assets.nercone.dev/styles/themes/',
            themes:           ['auto', 'auto-ud', 'auto-stark', 'auto-stark-ud', 'dark', 'light', 'black', 'white', 'dark-ud', 'light-ud', 'black-ud', 'white-ud'],
            theme:            'auto-stark',
            storageKey:       'nercone-theme',
            rootAttribute:    'data-theme',
            triggerAttribute: 'data-theme-trigger',
            // Kept by view-transition.js when it swaps the page, so the theme stays applied without loading again.
            linkAttributes:   { 'data-view-transition-keep': '' }
        };

        constructor(options = {}) {
            this.options = { ...Theme.DEFAULTS, ...options };
            // Resolved now: a relative URL follows the document URL, which view-transition.js changes with pushState.
            this.baseURL = new URL(this.options.baseURL, document.baseURI).href;
            this.name = null;
            this.link = null;
            this.request = 0;
            this.abortController = null;
        }

        // Lifecycle
        init() {
            if (this.abortController) return;
            this.abortController = new AbortController();
            document.addEventListener('click', this.onClick, { signal: this.abortController.signal });

            // The saved theme comes first, then the one in the root attribute, then the theme option.
            const candidates = [this.load(), document.documentElement.getAttribute(this.options.rootAttribute), this.options.theme];
            const name = candidates.find(candidate => this.isTheme(candidate));
            if (name) this.set(name, { save: false });
            else this.sync();
        }

        reinit() {
            this.init();
            this.sync();
        }

        destroy() {
            this.abortController?.abort();
            this.abortController = null;
        }

        // Events
        onClick = (event) => {
            if (event.defaultPrevented) return;
            const trigger = event.target.closest?.(`[${this.options.triggerAttribute}]`);
            if (!trigger) return;
            const name = trigger.getAttribute(this.options.triggerAttribute);
            this.set(name === '' ? null : name);
        };

        // Control
        get() {
            return this.name;
        }

        isTheme(name) {
            return typeof name === 'string' && this.options.themes.includes(name);
        }

        urlOf(name) {
            return new URL(`${encodeURIComponent(name)}.css`, this.baseURL).href;
        }

        // Applies the theme NAME, or removes the theme stylesheet when NAME is null, which leaves the page's own colors.
        // Resolves to true when the theme is applied, and to false when NAME is not a theme or its stylesheet failed to load.
        async set(name, { save = true } = {}) {
            if (name !== null && !this.isTheme(name)) {
                console.error(`[nercone] theme.set(): unknown theme: ${name}`);
                return false;
            }
            const request = ++this.request;

            let link = null;
            if (name !== null) {
                link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = this.urlOf(name);
                for (const [attribute, value] of Object.entries(this.options.linkAttributes)) link.setAttribute(attribute, value);
                document.head.append(link);
                // The old stylesheet stays until the new one is loaded, so the colors do not flash.
                const loaded = await window.nercone.Nercone.whenLoaded(link);
                if (request !== this.request) {
                    link.remove();
                    return false;
                }
                if (!loaded) {
                    link.remove();
                    console.error(`[nercone] theme.set(): failed to load ${link.href}`);
                    return false;
                }
            }

            this.link?.remove();
            this.link = link;
            this.name = name;
            if (name === null) document.documentElement.removeAttribute(this.options.rootAttribute);
            else document.documentElement.setAttribute(this.options.rootAttribute, name);
            if (save) this.save(name);
            this.sync();
            return true;
        }

        // Storage
        load() {
            if (!this.options.storageKey) return null;
            try {
                return localStorage.getItem(this.options.storageKey);
            } catch {
                return null;
            }
        }

        save(name) {
            if (!this.options.storageKey) return;
            try {
                if (name === null) localStorage.removeItem(this.options.storageKey);
                else localStorage.setItem(this.options.storageKey, name);
            } catch {}
        }

        // Rendering
        sync() {
            // Checks the radio buttons and checkboxes whose trigger is the current theme, and unchecks the others.
            const { triggerAttribute } = this.options;
            for (const input of document.querySelectorAll(`input[${triggerAttribute}]`)) {
                if (input.type !== 'radio' && input.type !== 'checkbox') continue;
                input.checked = input.getAttribute(triggerAttribute) === (this.name ?? '');
            }
        }
    }

    window.nercone.Theme = Theme;
    window.nercone.register('theme', new Theme());
})();
