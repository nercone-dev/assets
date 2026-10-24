(() => {
    class Cursor {
        static DEFAULTS = {
            selector:       '#cursor',
            linkSelector:   'a, button, [role="button"], input[type="submit"], input[type="button"]',
            systemSelector: '.cursor-system',
            activeClass:    'cursor-active',
            padding:        6,
            linkGap:        4,
            textGap:        4
        };
        static RADIUS_PROPERTIES = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'];

        constructor(options = {}) {
            this.options = { ...Cursor.DEFAULTS, ...options };
            this.element = null;
            this.abortController = null;
            this.frame = 0;
            this.x = 0;
            this.y = 0;
            this.visible = false;
            this.detect = false;
            this.link = null;
            this.linkRadius = null;
        }

        // Lifecycle
        init() {
            this.element = document.querySelector(this.options.selector);
            if (!this.element) {
                this.hide();
                return;
            }
            if (this.abortController) return;

            this.abortController = new AbortController();
            const options = { passive: true, signal: this.abortController.signal };
            document.addEventListener('pointermove',   this.onPointerMove, options);
            document.addEventListener('pointerdown',   this.onPointerDown, options);
            document.addEventListener('pointerup',     this.onPointerUp,   options);
            document.addEventListener('pointercancel', this.onPointerUp,   options);
            document.addEventListener('pointerout',    this.onPointerOut,  options);
            document.addEventListener('scroll',        this.onScroll,      { ...options, capture: true });
        }

        cleanup() {
            this.setLink(null);
            if (this.frame) cancelAnimationFrame(this.frame);
            this.frame = 0;
        }

        reinit() {
            this.init();
            if (this.visible) this.show();
        }

        destroy() {
            this.abortController?.abort();
            this.abortController = null;
            this.cleanup();
            this.hide();
            this.element = null;
        }

        // Events
        onPointerMove = (event) => {
            if (event.pointerType !== 'mouse') return;
            this.x = event.clientX;
            this.y = event.clientY;
            if (event.target.closest?.(this.options.systemSelector)) this.hide();
            else this.show();
        };

        onPointerDown = (event) => {
            if (event.pointerType !== 'mouse') this.hide();
            else this.element?.classList.add('pressed');
        };

        onPointerUp = () => {
            this.element?.classList.remove('pressed');
        };

        onPointerOut = (event) => {
            if (event.pointerType !== 'mouse') return;
            if (!event.relatedTarget || event.relatedTarget instanceof HTMLIFrameElement) this.hide();
        };

        onScroll = () => {
            if (this.visible) this.request(true);
        };

        // Visibility
        show() {
            if (!this.element) return;
            this.visible = true;
            this.element.classList.add('visible');
            document.documentElement.classList.add(this.options.activeClass);
            this.request(true);
        }

        hide() {
            this.visible = false;
            this.cleanup();
            this.element?.classList.remove('visible', 'pressed', 'on-link', 'on-text');
            document.documentElement.classList.remove(this.options.activeClass);
        }

        // Rendering
        request(detect) {
            if (detect) this.detect = true;
            if (!this.frame) this.frame = requestAnimationFrame(this.render);
        }

        render = () => {
            this.frame = 0;
            if (!this.element || !this.visible) return;

            if (this.detect) {
                this.detect = false;
                this.setLink(this.findLink(this.x, this.y));
            }

            if (this.link) {
                this.renderLink();
                this.request(false);
            } else {
                this.renderPoint();
            }
        };

        renderPoint() {
            const style = this.element.style;
            this.element.classList.remove('on-link');
            this.element.classList.toggle('on-text', Cursor.isTextAt(this.x, this.y, this.options.textGap));
            style.left = `${this.x}px`;
            style.top  = `${this.y}px`;
            style.width = style.height = style.borderRadius = '';
        }

        renderLink() {
            const padding = this.options.padding;
            const bounds = Cursor.boundsOf(this.link);
            this.linkRadius ??= Cursor.radiusOf(this.link, bounds.width);

            const style = this.element.style;
            this.element.classList.remove('on-text');
            this.element.classList.add('on-link');
            style.left   = `${bounds.left - padding}px`;
            style.top    = `${bounds.top  - padding}px`;
            style.width  = `${bounds.width  + padding * 2}px`;
            style.height = `${bounds.height + padding * 2}px`;
            style.borderRadius = this.linkRadius.map(radius => `${radius + padding}px`).join(' ');
        }

        setLink(link) {
            if (this.link === link) return;
            this.link = link;
            this.linkRadius = null;
        }

        // Hit testing
        findLink(x, y) {
            const selector = this.options.linkSelector;
            const exact = document.elementFromPoint(x, y)?.closest(selector);
            if (exact) return exact;

            let nearest = null;
            let nearestDistance = Infinity;
            for (const link of document.querySelectorAll(selector)) {
                const rect = link.getBoundingClientRect();
                if (rect.width === 0 && rect.height === 0) continue;
                const distance = Math.max(0, rect.left - x, x - rect.right, rect.top - y, y - rect.bottom);
                if (distance <= this.options.linkGap && distance < nearestDistance) {
                    nearest = link;
                    nearestDistance = distance;
                }
            }
            return nearest;
        }

        static isTextAt(x, y, gap) {
            const caret = Cursor.caretAt(x, y);
            if (!caret || caret.node.nodeType !== Node.TEXT_NODE) return false;

            const { node, offset } = caret;
            const range = document.createRange();
            for (const [start, end] of [[offset, offset + 1], [offset - 1, offset]]) {
                if (start < 0 || end > node.length) continue;
                range.setStart(node, start);
                range.setEnd(node, end);
                for (const rect of range.getClientRects()) {
                    if (x >= rect.left - gap && x <= rect.right  + gap &&
                        y >= rect.top  - gap && y <= rect.bottom + gap) return true;
                }
            }
            return false;
        }

        static caretAt(x, y) {
            if (document.caretPositionFromPoint) {
                const position = document.caretPositionFromPoint(x, y);
                return position && { node: position.offsetNode, offset: position.offset };
            }
            if (document.caretRangeFromPoint) {
                const range = document.caretRangeFromPoint(x, y);
                return range && { node: range.startContainer, offset: range.startOffset };
            }
            return null;
        }

        // Geometry
        static boundsOf(element) {
            if (getComputedStyle(element).display === 'inline') {
                const range = document.createRange();
                range.selectNodeContents(element);
                const rect = range.getBoundingClientRect();
                if (rect.width > 0 || rect.height > 0) return rect;
            }
            return element.getBoundingClientRect();
        }

        static radiusOf(element, width) {
            for (const target of [element, ...element.children]) {
                const style = getComputedStyle(target);
                const radius = Cursor.RADIUS_PROPERTIES.map(property => Cursor.parseLength(style[property], width));
                if (radius.some(value => value > 0)) return radius;
            }
            return [0, 0, 0, 0];
        }

        static parseLength(value, reference) {
            const first = value.trim().split(/\s+/)[0];
            const number = parseFloat(first);
            if (!Number.isFinite(number)) return 0;
            return first.endsWith('%') ? number / 100 * reference : number;
        }
    }

    window.nercone.Cursor = Cursor;
    window.nercone.register('cursor', new Cursor());
})();
