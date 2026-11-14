(() => {
    class Swatch {
        static DEFAULTS = {
            attribute:       'data-swatch',
            formatAttribute: 'data-swatch-format',
            format:          'variable',
            toast:           true,
            copiedMessage:   value => `Copied ${value}`,
            failedMessage:   value => `Could not copy ${value}`
        };
        static FORMATS = ['variable', 'rgb', 'hex'];

        constructor(options = {}) {
            this.options = { ...Swatch.DEFAULTS, ...options };
            this.abortController = null;
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
        }

        // Events
        onClick = (event) => {
            if (event.defaultPrevented) return;
            const swatch = event.target.closest?.(`[${this.options.attribute}]`);
            if (!swatch) return;
            this.copy(swatch);
        };

        // Control
        async copy(swatch, format = this.formatOf(swatch)) {
            const toast = this.options.toast ? window.nercone.get('toast') : null;
            let value = null;
            try {
                value = this.valueOf(swatch, format);
                await navigator.clipboard.writeText(value);
            } catch (error) {
                console.error('[nercone] swatch.copy() failed:', error);
                toast?.show(this.options.failedMessage(value ?? this.propertyOf(swatch)), { variant: 'error' });
                return false;
            }
            toast?.show(this.options.copiedMessage(value), { variant: 'success' });
            return true;
        }

        formatOf(swatch) {
            const { formatAttribute, format } = this.options;
            return swatch.closest(`[${formatAttribute}]`)?.getAttribute(formatAttribute) ?? format;
        }

        propertyOf(swatch) {
            return swatch.getAttribute(this.options.attribute);
        }

        valueOf(swatch, format) {
            const property = this.propertyOf(swatch);
            if (!Swatch.isCustomProperty(property)) throw new Error(`not a custom property: ${property}`);
            switch (format) {
                case 'variable': return `var(${property})`;
                case 'rgb':      return Swatch.toRGB(Swatch.colorOf(swatch, property));
                case 'hex':      return Swatch.toHex(Swatch.colorOf(swatch, property));
                default:         throw new Error(`unknown format: ${format}`);
            }
        }

        // Colors
        static isCustomProperty(property) {
            return typeof property === 'string' && property.startsWith('--') && property.length > 2;
        }

        // Returns { red, green, blue, alpha } in sRGB of the custom property as seen from element:
        // red, green and blue from 0 to 255, alpha from 0 to 1.
        static colorOf(element, property) {
            if (getComputedStyle(element).getPropertyValue(property).trim() === '') throw new Error(`${property} is not defined`);
            // A custom property holds tokens, not a color, so it is resolved through a real color property.
            const probe = document.createElement('span');
            probe.hidden = true;
            probe.style.color = `var(${property})`;
            element.append(probe);
            const computed = getComputedStyle(probe).color;
            probe.remove();
            const color = Swatch.parse(computed);
            if (!color) throw new Error(`${property} is not an sRGB color: ${computed}`);
            return color;
        }

        // Parses the computed value of a color in sRGB: rgb(), rgba() and color(srgb ...).
        // Anything else (such as color(display-p3 ...) or oklch()) returns null instead of a guess.
        static parse(value) {
            const match = /^(rgba?|color)\(([^()]*)\)$/i.exec(value.trim());
            if (!match) return null;
            const name = match[1].toLowerCase();
            let tokens = match[2].trim().split(/[\s,/]+/).filter(Boolean);
            let scale = 255;
            if (name === 'color') {
                if (tokens.shift()?.toLowerCase() !== 'srgb') return null;
                scale = 1;
            }
            if (tokens.length !== 3 && tokens.length !== 4) return null;

            const [red, green, blue] = tokens.slice(0, 3).map(token => Swatch.parseComponent(token, scale) / scale * 255);
            const alpha = tokens.length === 4 ? Swatch.parseComponent(tokens[3], 1) : 1;
            if (![red, green, blue, alpha].every(Number.isFinite)) return null;
            return {
                red:   Swatch.clamp(red, 0, 255),
                green: Swatch.clamp(green, 0, 255),
                blue:  Swatch.clamp(blue, 0, 255),
                alpha: Swatch.clamp(alpha, 0, 1)
            };
        }

        static parseComponent(token, scale) {
            if (token.toLowerCase() === 'none') return 0;
            if (token.endsWith('%')) return Number(token.slice(0, -1)) / 100 * scale;
            return Number(token);
        }

        static toRGB({ red, green, blue, alpha }) {
            const channels = [red, green, blue].map(Math.round).join(' ');
            const opacity = Number(alpha.toFixed(3));
            return opacity === 1 ? `rgb(${channels})` : `rgb(${channels} / ${opacity})`;
        }

        static toHex({ red, green, blue, alpha }) {
            const hex = channel => Math.round(channel).toString(16).padStart(2, '0');
            const opacity = Math.round(alpha * 255);
            return `#${hex(red)}${hex(green)}${hex(blue)}${opacity === 255 ? '' : hex(opacity)}`;
        }

        static clamp(value, min, max) {
            return Math.min(Math.max(value, min), max);
        }
    }

    window.nercone.Swatch = Swatch;
    window.nercone.register('swatch', new Swatch());
})();
