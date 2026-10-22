(() => {
    class Cursor {
        static LINK_SELECTORS = 'a, button, [role="button"], input[type="submit"], input[type="button"]';
        static PADDING = 6;
        static TOUCH_MOUSE_GUARD_MS = 800;
        static TEXT_GAP_PX = 4;
        static LINK_GAP_PX = 4;

        constructor() {
            this.ac = null;
            this.mouseX = 0;
            this.mouseY = 0;
            this.currentLinkEl = null;
            this.rafId = null;
            this.cursor = null;
            this.cursorVisible = false;
            this.lastTouchTime = 0;
            this.isMouseDown = false;

            document.documentElement.style.cursor = 'none';
        }

        // Visibility
        showCursor() {
            if (!this.cursorVisible && this.cursor) {
                this.cursorVisible = true;
                this.cursor.classList.add('visible');
            }
        }

        hideCursor() {
            if (this.cursor) {
                this.cursorVisible = false;
                this.cursor.style.borderRadius = '';
                this.cursor.classList.remove('visible');
                this.currentLinkEl = null;
                if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
                this.cursor.classList.remove('on-link', 'on-text');
            }
        }

        isSyntheticMouse() {
            return Date.now() - this.lastTouchTime < Cursor.TOUCH_MOUSE_GUARD_MS;
        }

        // Helpers
        findNearbyLink(x, y) {
            const el = document.elementFromPoint(x, y);
            const exact = el ? el.closest(Cursor.LINK_SELECTORS) : null;
            if (exact) return exact;

            let best = null;
            let bestDist = Infinity;
            for (const link of document.querySelectorAll(Cursor.LINK_SELECTORS)) {
                const r = link.getBoundingClientRect();
                const dx = Math.max(0, r.left - x, x - r.right);
                const dy = Math.max(0, r.top  - y, y - r.bottom);
                const dist = Math.max(dx, dy);
                if (dist <= Cursor.LINK_GAP_PX && dist < bestDist) {
                    bestDist = dist;
                    best = link;
                }
            }
            return best;
        }

        isOverRenderedText(x, y) {
            let node, offset;
            if (document.caretPositionFromPoint) {
                const pos = document.caretPositionFromPoint(x, y);
                if (!pos || pos.offsetNode.nodeType !== Node.TEXT_NODE) return false;
                node = pos.offsetNode;
                offset = pos.offset;
            } else if (document.caretRangeFromPoint) {
                const r = document.caretRangeFromPoint(x, y);
                if (!r || r.startContainer.nodeType !== Node.TEXT_NODE) return false;
                node = r.startContainer;
                offset = r.startOffset;
            } else {
                return false;
            }

            const range = document.createRange();
            const candidates = [];
            if (offset < node.length) candidates.push([offset, offset + 1]);
            if (offset > 0)           candidates.push([offset - 1, offset]);
            if (candidates.length === 0) return false;

            const gap = Cursor.TEXT_GAP_PX;
            for (const [s, e] of candidates) {
                range.setStart(node, s);
                range.setEnd(node, e);
                for (const rect of range.getClientRects()) {
                    if (x >= rect.left - gap && x <= rect.right  + gap &&
                        y >= rect.top  - gap && y <= rect.bottom + gap) return true;
                }
            }
            return false;
        }

        // Rendering
        updateCursorForLink(el) {
            const PADDING = Cursor.PADDING;
            let rect = el.getBoundingClientRect();

            if (getComputedStyle(el).display === 'inline') {
                const descendants = el.querySelectorAll('*');
                if (descendants.length > 0) {
                    const rects = [...descendants].map(c => c.getBoundingClientRect());
                    const left   = Math.min(...rects.map(r => r.left));
                    const top    = Math.min(...rects.map(r => r.top));
                    const right  = Math.max(...rects.map(r => r.right));
                    const bottom = Math.max(...rects.map(r => r.bottom));
                    rect = { left, top, width: right - left, height: bottom - top };
                }
            }

            this.cursor.classList.remove('on-text');
            this.cursor.classList.add('on-link');
            this.cursor.style.transform = 'none';
            this.cursor.style.left   = (rect.left - PADDING) + 'px';
            this.cursor.style.top    = (rect.top  - PADDING) + 'px';
            this.cursor.style.width  = (rect.width  + PADDING * 2) + 'px';
            this.cursor.style.height = (rect.height + PADDING * 2) + 'px';

            function parseRadius(val, wRef) {
                if (!val) return 0;
                const first = val.trim().split(' ')[0];
                return first.endsWith('%') ? parseFloat(first) / 100 * wRef : (parseFloat(first) || 0);
            }

            function resolveRadiusSource(el, wRef) {
                const PROPS = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'];
                for (const target of [el, ...el.children]) {
                    const cs = getComputedStyle(target);
                    if (PROPS.some(p => parseRadius(cs[p], wRef) > 0)) return cs;
                }
                return getComputedStyle(el);
            }

            const w = rect.width;
            const cs = resolveRadiusSource(el, w);
            this.cursor.style.borderRadius = [
                cs.borderTopLeftRadius,
                cs.borderTopRightRadius,
                cs.borderBottomRightRadius,
                cs.borderBottomLeftRadius,
            ].map(v => `${parseRadius(v, w) + PADDING}px`).join(' ');
        }

        trackLink = () => {
            if (this.currentLinkEl) {
                this.updateCursorForLink(this.currentLinkEl);
                this.rafId = requestAnimationFrame(this.trackLink);
            }
        };

        // Lifecycle
        init() {
            this.ac = new AbortController();
            const signal = this.ac.signal;

            this.cursor = document.getElementById('cursor');
            if (!this.cursor) return;

            document.addEventListener('touchstart', () => { this.lastTouchTime = Date.now(); this.hideCursor(); }, { passive: true, signal });
            document.addEventListener('touchmove',  () => { this.lastTouchTime = Date.now(); this.hideCursor(); }, { passive: true, signal });
            document.addEventListener('touchend',   () => { this.lastTouchTime = Date.now(); },                   { passive: true, signal });

            document.addEventListener('mouseover', (e) => { if (e.target.tagName === 'IFRAME' || e.target.closest('.cursor-system')) this.hideCursor(); }, { signal });

            document.addEventListener('mousemove', (e) => {
                if (this.isSyntheticMouse()) return;
                if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;

                if (e.target.closest('.cursor-system')) { this.hideCursor(); return; }

                this.mouseX = e.clientX;
                this.mouseY = e.clientY;

                this.showCursor();

                const linkEl = this.findNearbyLink(this.mouseX, this.mouseY);

                if (linkEl) {
                    if (this.currentLinkEl !== linkEl) {
                        this.currentLinkEl = linkEl;
                        if (this.rafId) cancelAnimationFrame(this.rafId);
                        this.rafId = requestAnimationFrame(this.trackLink);
                    }
                } else {
                    if (this.currentLinkEl) {
                        this.currentLinkEl = null;
                        if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
                    }
                    this.cursor.classList.remove('on-link');
                    this.cursor.style.transform = this.isMouseDown ? 'translate(-50%, -50%) scale(0.9)' : 'translate(-50%, -50%)';
                    this.cursor.style.borderRadius = '';
                    this.cursor.style.left = this.mouseX + 'px';
                    this.cursor.style.top  = this.mouseY + 'px';
                    this.cursor.style.width = '';
                    this.cursor.style.height = '';

                    if (this.isOverRenderedText(this.mouseX, this.mouseY)) {
                        this.cursor.classList.add('on-text');
                    } else {
                        this.cursor.classList.remove('on-text');
                    }
                }
            }, { signal });

            document.addEventListener('mousedown', () => {
                this.isMouseDown = true;
                this.cursor.style.transform = this.currentLinkEl ? 'none' : 'translate(-50%, -50%) scale(0.9)';
            }, { signal });
            document.addEventListener('mouseup', () => {
                this.isMouseDown = false;
                this.cursor.style.transform = this.currentLinkEl ? 'none' : 'translate(-50%, -50%) scale(1)';
            }, { signal });

            window.addEventListener('scroll', () => {
                if (this.currentLinkEl) this.updateCursorForLink(this.currentLinkEl);
            }, { passive: true, signal });
        }

        cleanup() {
            if (this.ac) this.ac.abort();
            if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
            document.documentElement.style.cursor = '';
            this.currentLinkEl = null;
        }

        reinit() {
            this.cursor = document.getElementById('cursor');
            if (!this.cursor) return;

            this.currentLinkEl = null;

            if (this.rafId) {
                cancelAnimationFrame(this.rafId); this.rafId = null;
            }

            this.cursor.classList.remove('on-link', 'on-text');
            this.cursor.style.transform = 'translate(-50%, -50%)';
            this.cursor.style.borderRadius = '';
            this.cursor.style.left = this.mouseX + 'px';
            this.cursor.style.top  = this.mouseY + 'px';
            this.cursor.style.width = '';
            this.cursor.style.height = '';

            const newLinkEl = this.findNearbyLink(this.mouseX, this.mouseY);
            if (newLinkEl) {
                this.currentLinkEl = newLinkEl;
                this.rafId = requestAnimationFrame(this.trackLink);
            } else if (this.isOverRenderedText(this.mouseX, this.mouseY)) {
                this.cursor.classList.add('on-text');
            }

            this.init();
        }
    }

    const cursor = new Cursor();
    window.nercone.register('cursor', {
        init:    () => cursor.init(),
        cleanup: () => cursor.cleanup(),
        reinit:  () => cursor.reinit()
    });
})();
