(() => {
    if (!document.startViewTransition) return;

    let abortController = null;

    // DOMParser parses <noscript> contents as real elements, so they must never be taken over.
    function queryActive(root, selector) {
        return [...root.querySelectorAll(selector)].filter(el => !el.closest('noscript'));
    }

    function preloadAssets(newDoc) {
        const curStyleHrefs = new Set([...document.querySelectorAll('link[rel="stylesheet"]')].map(l => l.href));
        const curScriptSrcs = new Set([...document.querySelectorAll('script[src]')].map(s => s.src));

        const tasks = [];

        const newStyles = [
            ...queryActive(newDoc.head, 'link[rel="stylesheet"]'),
            ...queryActive(newDoc.body, ':scope > link[rel="stylesheet"]'),
        ];
        newStyles
            .filter(l => !curStyleHrefs.has(new URL(l.href, location.href).href))
            .forEach(link => tasks.push(new Promise(resolve => {
                const l = link.cloneNode(true);
                l.addEventListener('load',  resolve, { once: true });
                l.addEventListener('error', resolve, { once: true });
                document.head.appendChild(l);
            })));

        const newScriptEls = [
            ...queryActive(newDoc.head, 'script[src]'),
            ...queryActive(newDoc.body, ':scope > script[src]'),
        ].filter(s => !curScriptSrcs.has(new URL(s.src, location.href).href));

        newScriptEls.forEach(script => tasks.push(new Promise(resolve => {
            const l = document.createElement('link');
            l.rel = 'preload';
            l.as = 'script';
            l.href = new URL(script.getAttribute('src'), location.href).href;
            l.addEventListener('load',  resolve, { once: true });
            l.addEventListener('error', resolve, { once: true });
            document.head.appendChild(l);
        })));

        return Promise.all(tasks).then(() => newScriptEls);
    }

    function updateHead(newDoc) {
        const head = document.head;
        const newHead = newDoc.head;

        const t = newHead.querySelector('title');
        if (t) document.title = t.textContent;

        const META_KEEP = new Set(['charset', 'viewport', 'color-scheme', 'theme-color']);
        head.querySelectorAll('meta').forEach((m) => {
            const key = m.getAttribute('name') || m.getAttribute('property');
            if (!key || META_KEEP.has(key)) return;
            m.remove();
        });
        const insertRef = head.querySelector(
            'link[rel="preconnect"], link[rel="stylesheet"], link[rel="manifest"], link[rel="icon"], script'
        );
        queryActive(newHead, 'meta[name], meta[property]').forEach((m) => {
            const key = m.getAttribute('name') || m.getAttribute('property');
            if (!META_KEEP.has(key)) head.insertBefore(m.cloneNode(true), insertRef);
        });

        const nc = newHead.querySelector('link[rel="canonical"]');
        const cc = head.querySelector('link[rel="canonical"]');
        if (nc && cc) cc.href = nc.href;

        const newStyleHrefs = new Set([
            ...queryActive(newHead, 'link[rel="stylesheet"]'),
            ...queryActive(newDoc.body, ':scope > link[rel="stylesheet"]'),
        ].map(l => new URL(l.href, location.href).href));
        head.querySelectorAll('link[rel="stylesheet"]').forEach((l) => {
            if (!newStyleHrefs.has(l.href)) l.remove();
        });
        document.body.querySelectorAll(':scope > link[rel="stylesheet"]').forEach((l) => {
            if (!newStyleHrefs.has(l.href)) l.remove();
        });

        const newScriptSrcs = new Set([
            ...queryActive(newHead, 'script[src]'),
            ...queryActive(newDoc.body, ':scope > script[src]'),
        ].map(s => new URL(s.src, location.href).href));
        head.querySelectorAll('script[src]').forEach((s) => {
            if (!newScriptSrcs.has(s.src)) s.remove();
        });
        document.body.querySelectorAll(':scope > script[src]').forEach((s) => {
            if (!newScriptSrcs.has(s.src)) s.remove();
        });

        head.querySelectorAll('style').forEach(s => s.remove());
        queryActive(newHead, 'style').forEach(s => head.appendChild(s.cloneNode(true)));
    }

    async function navigate(url, pushHistory = true) {
        if (abortController) abortController.abort();
        const ac = new AbortController();
        abortController = ac;

        document.startViewTransition(async () => {
            // Fetch
            let response;
            try {
                response = await fetch(url.href, {
                    headers: { 'X-Requested-With': 'view-transition' },
                    signal: ac.signal
                });
            } catch (err) {
                if (err.name === 'AbortError') return;
                location.href = url.href;
                return;
            }

            if (ac.signal.aborted) return;

            const html = await response.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');

            // Cleanup
            window.nercone.cleanup();

            // Head
            const deferredScripts = await preloadAssets(doc);
            updateHead(doc);

            // Swap
            for (const tag of ['header', 'main']) {
                const newEl = doc.querySelector(tag);
                const curEl = document.querySelector(tag);

                if (!newEl || !curEl) {
                    location.href = url.href; return;
                }

                [...curEl.attributes].forEach(a => curEl.removeAttribute(a.name));
                [...newEl.attributes].forEach(a => curEl.setAttribute(a.name, a.value));

                curEl.innerHTML = newEl.innerHTML;

                curEl.querySelectorAll('script').forEach((old) => {
                    const s = document.createElement('script');
                    [...old.attributes].forEach(a => s.setAttribute(a.name, a.value));
                    s.textContent = old.textContent;
                    old.replaceWith(s);
                });
            }

            // Deferred scripts
            deferredScripts.forEach((script) => {
                const s = document.createElement('script');
                [...script.attributes].forEach(a => s.setAttribute(a.name, a.value));
                document.head.appendChild(s);
            });

            if (pushHistory) history.pushState(null, '', response.url);

            // Reinit
            window.nercone.reinit(doc);
        });
    }

    window.nercone.navigate = (href) => {
        let url;
        try { url = new URL(href, location.href); } catch (_) { location.href = href; return; }
        if (url.origin !== location.origin) { location.href = href; return; }
        navigate(url);
    };

    document.addEventListener('click', (event) => {
        const link = event.target.closest('a');
        if (!link || link.hasAttribute('download')) return;

        const url = new URL(link.href, location.href);
        if (url.origin !== location.origin) return;
        if (link.target || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

        if (url.hash && url.pathname === location.pathname) {
            event.preventDefault();
            const target = document.querySelector(url.hash);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                history.pushState(null, '', url.hash);
            }
            return;
        }

        event.preventDefault();
        navigate(url);
    });

    window.addEventListener('popstate', () => navigate(new URL(location.href), false));
})();
