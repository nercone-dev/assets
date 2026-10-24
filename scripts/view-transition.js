(() => {
    class PageTransition {
        static DEFAULTS = {
            regions:  ['header', 'main'],
            keepMeta: ['charset', 'viewport', 'color-scheme', 'theme-color'],
            headers:  { 'X-Requested-With': 'view-transition' }
        };

        constructor(options = {}) {
            this.options = { ...PageTransition.DEFAULTS, ...options };
            this.abortController = null;
            this.navigation = null;
            this.url = null;
            this.sources = new WeakMap();
        }

        static isSupported() {
            return typeof document.startViewTransition === 'function';
        }

        // Lifecycle
        init() {
            if (this.abortController) return;
            this.abortController = new AbortController();
            const signal = this.abortController.signal;

            this.url = new URL(location.href);
            for (const element of PageTransition.assetsOf(document)) this.sources.set(element, PageTransition.sourceOf(element));
            history.scrollRestoration = 'manual';
            const scroll = PageTransition.scrollOf(history.state);
            if (scroll) PageTransition.whenPageLoaded(() => this.restoreScroll(this.url, scroll, 'auto'));

            document.addEventListener('click',  this.onClick,    { signal });
            window.addEventListener('popstate', this.onPopState, { signal });
            window.addEventListener('pagehide', this.onPageHide, { signal });
        }

        destroy() {
            this.navigation?.abort();
            this.abortController?.abort();
            this.abortController = null;
            history.scrollRestoration = 'auto';
        }

        // Events
        onClick = (event) => {
            if (event.defaultPrevented || event.button !== 0) return;
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

            const link = event.target.closest?.('a[href], area[href]');
            if (!link || link.hasAttribute('download')) return;

            const target = link.getAttribute('target');
            if (target && target !== '_self') return;

            const url = PageTransition.parseURL(link.getAttribute('href'), document.baseURI);
            if (!url || url.origin !== location.origin) return;

            event.preventDefault();
            this.go(url);
        };

        onPopState = (event) => {
            const url = new URL(location.href);
            const scroll = PageTransition.scrollOf(event.state);
            if (PageTransition.isSameDocument(url, this.url)) this.restoreScroll(url, scroll, 'auto');
            else this.go(url, { pop: true, scroll });
        };

        onPageHide = () => {
            this.saveScroll();
        };

        // Navigation
        navigate(href) {
            const url = PageTransition.parseURL(href, location.href);
            if (!url || url.origin !== location.origin) location.assign(href);
            else this.go(url);
        }

        async go(url, { pop = false, scroll = null } = {}) {
            this.navigation?.abort();
            const navigation = new AbortController();
            this.navigation = navigation;
            const signal = navigation.signal;

            if (!pop && url.hash && PageTransition.isSameDocument(url, this.url)) {
                this.saveScroll();
                if (url.href !== location.href) history.pushState(null, '', url);
                this.restoreScroll(url, null, 'smooth');
                return;
            }

            let preloads = [];
            try {
                const page = await this.load(url, signal);
                if (signal.aborted) return;
                if (!page) {
                    location.assign(url);
                    return;
                }

                preloads = this.preload(page);
                await Promise.all(preloads.map(link => PageTransition.whenLoaded(link)));
                if (signal.aborted) return;

                if (!pop) this.saveScroll();
                const transition = document.startViewTransition(() => this.swap(page, { pop, scroll, signal }));
                // A skipped or failed transition rejects these as well; updateCallbackDone reports the failure.
                transition.ready.catch(() => {});
                transition.finished.catch(() => {});
                await transition.updateCallbackDone;
            } catch (error) {
                if (signal.aborted) return;
                console.error('[nercone] view-transition failed:', error);
                location.assign(url);
            } finally {
                for (const link of preloads) link.remove();
                if (this.navigation === navigation) this.navigation = null;
            }
        }

        async load(url, signal) {
            const response = await fetch(url, { headers: this.options.headers, signal });
            if (!PageTransition.isHTML(response)) return null;

            const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
            if (!this.options.regions.every(selector => doc.querySelector(selector) && document.querySelector(selector))) return null;

            const pageURL = new URL(response.url || url);
            pageURL.hash = url.hash;
            const baseHref = doc.querySelector('base[href]')?.getAttribute('href');
            const base = (baseHref && PageTransition.parseURL(baseHref, pageURL)) || pageURL;
            return { url: pageURL, base, doc };
        }

        preload(page) {
            const loaded = new Set(PageTransition.assetsOf(document).map(element => this.sourceOf(element)));
            const links = [];
            const add = (element, as) => {
                const href = PageTransition.urlOf(element, page.base);
                if (!href || loaded.has(href)) return;
                loaded.add(href);
                const link = document.createElement('link');
                link.rel = as === 'module' ? 'modulepreload' : 'preload';
                if (as !== 'module') link.as = as;
                link.href = href;
                PageTransition.copyAttributes(element, link, ['crossorigin', 'integrity', 'referrerpolicy']);
                document.head.append(link);
                links.push(link);
            };
            for (const link of PageTransition.stylesheetsOf(page.doc)) add(link, 'style');
            for (const script of PageTransition.scriptsOf(page.doc)) add(script, script.type === 'module' ? 'module' : 'script');
            return links;
        }

        // Swap
        async swap(page, { pop, scroll, signal }) {
            const styles = this.addStylesheets(page);
            await Promise.all(styles.map(link => PageTransition.whenLoaded(link)));
            if (signal.aborted) {
                for (const link of styles) link.remove();
                return;
            }

            window.nercone.cleanup();

            if (!pop) {
                if (page.url.href === location.href) history.replaceState(null, '', page.url);
                else history.pushState(null, '', page.url);
            }
            this.url = new URL(location.href);

            this.syncHead(page);
            this.swapRegions(page);
            this.addScripts(page);
            this.restoreScroll(this.url, scroll, 'auto');

            window.nercone.reinit(page.doc);
        }

        addStylesheets(page) {
            const current = new Set(PageTransition.stylesheetsOf(document).map(link => this.sourceOf(link)));
            const added = [];
            for (const link of PageTransition.stylesheetsOf(page.doc)) {
                const href = PageTransition.urlOf(link, page.base);
                if (!href || current.has(href)) continue;
                current.add(href);
                const clone = link.cloneNode();
                clone.href = href;
                document.head.append(clone);
                added.push(clone);
            }
            return added;
        }

        syncHead(page) {
            const head = document.head;
            const newHead = page.doc.head;
            const keepMeta = new Set(this.options.keepMeta);
            const metaKey = meta => meta.getAttribute('name') || meta.getAttribute('property');

            // Title
            const title = newHead.querySelector('title');
            if (title) document.title = title.textContent;

            // Meta and canonical
            for (const meta of head.querySelectorAll('meta[name], meta[property]')) {
                if (!keepMeta.has(metaKey(meta))) meta.remove();
            }
            for (const link of head.querySelectorAll('link[rel="canonical"]')) link.remove();

            const anchor = head.querySelector('link, script, style');
            for (const meta of PageTransition.activeElements(newHead, 'meta[name], meta[property]')) {
                if (!keepMeta.has(metaKey(meta))) head.insertBefore(meta.cloneNode(), anchor);
            }
            const canonical = PageTransition.activeElements(newHead, 'link[rel="canonical"]')[0];
            const canonicalHref = canonical && PageTransition.urlOf(canonical, page.base);
            if (canonicalHref) {
                const link = canonical.cloneNode();
                link.href = canonicalHref;
                head.insertBefore(link, anchor);
            }

            // Stylesheets
            const stylesheets = new Set(PageTransition.stylesheetsOf(page.doc).map(link => PageTransition.urlOf(link, page.base)));
            for (const link of PageTransition.stylesheetsOf(document)) {
                if (!stylesheets.has(this.sourceOf(link))) link.remove();
            }

            // Inline styles
            for (const style of head.querySelectorAll('style')) style.remove();
            for (const style of PageTransition.activeElements(newHead, 'style')) head.append(style.cloneNode(true));
        }

        swapRegions(page) {
            for (const selector of this.options.regions) {
                const current = document.querySelector(selector);
                const next = page.doc.querySelector(selector);

                for (const attribute of [...current.attributes]) current.removeAttribute(attribute.name);
                PageTransition.copyAttributes(next, current);

                // innerHTML re-parses with scripting enabled, so <noscript> contents stay inert.
                current.innerHTML = next.innerHTML;
                for (const script of current.querySelectorAll('script')) script.replaceWith(PageTransition.cloneScript(script));
            }
        }

        addScripts(page) {
            const current = new Set(PageTransition.assetsOf(document).map(element => this.sourceOf(element)));
            for (const script of PageTransition.scriptsOf(page.doc)) {
                const src = PageTransition.urlOf(script, page.base);
                if (!src || current.has(src)) continue;
                current.add(src);
                const clone = PageTransition.cloneScript(script);
                clone.src = src;
                clone.async = script.hasAttribute('async');
                document.head.append(clone);
            }
        }

        // Sources
        sourceOf(element) {
            // Relative href/src values follow the document URL, which pushState changes; the URL recorded when the element was loaded does not.
            return this.sources.get(element) ?? PageTransition.sourceOf(element);
        }

        // Scroll
        saveScroll() {
            const state = history.state && typeof history.state === 'object' ? history.state : {};
            history.replaceState({ ...state, scroll: [scrollX, scrollY] }, '');
        }

        restoreScroll(url, scroll, behavior) {
            if (scroll) {
                window.scrollTo({ left: scroll[0], top: scroll[1], behavior });
                return;
            }
            const target = PageTransition.targetOf(url);
            if (target) target.scrollIntoView({ behavior, block: 'start' });
            else if (!url.hash || url.hash === '#top') window.scrollTo({ left: 0, top: 0, behavior });
        }

        // Helpers
        static activeElements(root, selector) {
            // DOMParser parses <noscript> contents as real elements, so they must never be taken over.
            return [...root.querySelectorAll(selector)].filter(element => !element.closest('noscript'));
        }

        static stylesheetsOf(doc) {
            return [
                ...PageTransition.activeElements(doc.head, 'link[rel="stylesheet"]'),
                ...PageTransition.activeElements(doc.body, ':scope > link[rel="stylesheet"]')
            ];
        }

        static scriptsOf(doc) {
            return [
                ...PageTransition.activeElements(doc.head, 'script[src]'),
                ...PageTransition.activeElements(doc.body, ':scope > script[src]')
            ];
        }

        static assetsOf(doc) {
            return [...PageTransition.stylesheetsOf(doc), ...PageTransition.activeElements(doc, 'script[src]')];
        }

        static sourceOf(element) {
            return element.localName === 'script' ? element.src : element.href;
        }

        static cloneScript(script) {
            const clone = document.createElement('script');
            PageTransition.copyAttributes(script, clone);
            clone.textContent = script.textContent;
            return clone;
        }

        static copyAttributes(source, target, names = null) {
            for (const attribute of source.attributes) {
                if (!names || names.includes(attribute.name)) target.setAttribute(attribute.name, attribute.value);
            }
        }

        static parseURL(href, base) {
            try {
                return new URL(href, base);
            } catch {
                return null;
            }
        }

        static urlOf(element, base) {
            const attribute = element.localName === 'script' ? 'src' : 'href';
            return PageTransition.parseURL(element.getAttribute(attribute), base)?.href ?? null;
        }

        static targetOf(url) {
            if (!url.hash) return null;
            let id = url.hash.slice(1);
            try {
                id = decodeURIComponent(id);
            } catch {}
            return document.getElementById(id) ?? document.getElementsByName(id)[0] ?? null;
        }

        static scrollOf(state) {
            const scroll = state?.scroll;
            return Array.isArray(scroll) && scroll.length === 2 && scroll.every(Number.isFinite) ? scroll : null;
        }

        static isSameDocument(a, b) {
            return a.origin === b.origin && a.pathname === b.pathname && a.search === b.search;
        }

        static isHTML(response) {
            const type = response.headers.get('Content-Type') ?? '';
            return type.split(';')[0].trim().toLowerCase() === 'text/html';
        }

        static whenLoaded(element) {
            return new Promise(resolve => {
                element.addEventListener('load',  resolve, { once: true });
                element.addEventListener('error', resolve, { once: true });
            });
        }

        static whenPageLoaded(callback) {
            if (document.readyState === 'complete') callback();
            else window.addEventListener('load', callback, { once: true });
        }
    }

    window.nercone.PageTransition = PageTransition;
    if (PageTransition.isSupported()) window.nercone.setNavigator(new PageTransition());
})();
