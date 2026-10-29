# Components

Design decisions for components in `styles/components/` and `scripts/`. Usage examples live in `examples/`.

## Shared rules

- A component is one CSS file and, only when the browser cannot do the job alone, one script with the same name.
- Colors come from `--color-{component}-*` variables defined in `styles/colors.css` (`/* Semantic (Components) */`). Sizes come from `--{component}-*` variables with a fallback in the component's CSS, so they can be overridden on any element.
- Scripts register an instance with `window.nercone.register(name, instance)` and can be reached with `window.nercone.get(name)`. Each class is also exposed (`window.nercone.Slider` etc.) so a user can register a new instance with other options under the same name.
- Utility classes (single-purpose class rules in `main.css`, `colors.css` and `fonts.css`, such as `no-padding`, `small:hide`, `bd-color-*` and `font-weight-*`) use `!important` on every declaration. These files are loaded before the components, so with plain declarations a component rule of the same specificity (`.layer { padding }`, `.block { border }`, `.button { font-weight }`) won and the utility silently did nothing; `.layer.hide` was even still shown. A utility is only added to change that one property, so it must win regardless of load order and specificity. `@layer` was not used: every component would have to be moved into a layer, and layered styles lose to any unlayered user CSS, which changes how existing sites override components. Among utilities, the one defined later in the file still wins (e.g. `hide small:show`).
- Components that correspond to a native element are applied to that element without a class: Button (`<button>`, `<input type="button">`, `<input type="submit">`, `<input type="reset">`), Textfield (`<textarea>` and `<input>` without `type` or with `type` `text`, `search`, `email`, `url`, `tel`, `password`, `number`, `date`, `time`, `datetime-local`, `month`, `week`), Dropdown (`<select>`), Slider (`<input type="range">`), Table (`<table>`), Popup (`<dialog>`) and Details (`<details>`). Each rule is written as `.class, :where(element)`, so the class keeps working on other elements (such as `<a class="button">`) and keeps its specificity, while the element part has the specificity of `:where()` (zero) and is overridden by any class or element selector in a site's CSS. The `<input>` types are listed explicitly instead of excluding the ones that are not text, so a type added to HTML later is not styled as a text field before it has been checked. Variants such as `button-primary` only set variables and work on the bare element too (`<button class="button-primary">`). Elements styled by another component are excluded in the selector (`.sidebar-toggle` and `.toast-close` from Button, `.sidebar details` from Details) rather than undone in that component's CSS, because those elements share almost nothing with the default style and every property added to the default would otherwise have to be undone there too. Pseudo-classes such as `:hover` are outside `:where()`, so those rules have the specificity of one class. A site's own element styled from scratch (such as the swatches in `examples/colors.html`, which are `<button class="swatch">`) still receives every default property it does not set itself; there, `align-items: center` shrank an unsized `::before` to zero width. Such a class should start with `all: unset` and then set what it needs. `all` does not touch custom properties. The rule must come after the component CSS, because its specificity equals that of the `:hover`/`:active` defaults; a page's own `<style>` normally does.
- `<main>` is kept across page transitions (`view-transition.js` replaces its contents only), so scripts listen on `document` (one listener, guarded by an `AbortController`) instead of on elements that may be replaced.

## Slider

- Slider styles `<input type="range">` (and `.slider`). The filled part is a background gradient on the input itself, sized by `--slider-thickness`; the tracks are transparent. This draws the same way in every engine, unlike `::-moz-range-progress`, which only exists in Firefox.
- The fill ends at the thumb's center: `thumb / 2 + ratio * (100% - thumb)`.
- CSS cannot read an input's current value, so `slider.js` writes `--slider-value` (0 to 1) on elements matching its `selector` option (`.slider, input[type="range"]`). It updates on `input`, `change`, form `reset`, added nodes, and changes to the `value`/`min`/`max` attributes. Setting `.value` from a script fires none of these; call `window.nercone.get('slider').update(element)` after doing so.
- Without the script the slider still works, only without the fill.

## Table

- Table styles every `<table>` (and `.table`); `table-striped`, `table-hover` and `table-bordered` can be combined. `table-numeric` on a cell aligns numbers to the end with tabular figures.
- `table-scroll` is a wrapper rather than `display: block` on the table, because changing a table's display removes its table semantics in some screen readers.

## Details

- Every `<details>` is styled without a class, matching `:where(details:not(.sidebar details))`. Earlier it was opt-in with a `.details` class, so that the sidebar and pages such as `<details class="layer">` would not have to undo a global rule; it was changed so that a plain `<details>` looks the same as every other component without extra markup. The sidebar is excluded in the selector instead of undoing the rules in `sidebar.css`, since its folders share almost no properties with this style. `:where()` keeps the specificity of a bare element selector, so a class on the `<details>` (such as `.layer`) still overrides these rules. Any `class="details"` left in existing markup is harmless.
- The UA marker is hidden (`list-style: none` and `::-webkit-details-marker` for Safari) and replaced with a triangle drawn by `clip-path` on `summary::after`, so it has the same shape in every engine and follows `currentColor`. It points down when closed and turns to point up when open. The sidebar's folders use the same triangle.
- The content is spaced with margins on `details > :not(summary)` instead of `::details-content`, which older browsers do not support; without it the content would lose its padding there.
- `summary` is in the cursor's default `linkSelector`, because it is clicked like a button (both here and in the sidebar's folders).

## Popup

- Popup styles every native `<dialog>` (and `.popup`). `popup.js`'s `selector` option is `.popup, dialog`; `cleanup()` closes the open ones by checking the `open` property, because appending `[open]` to a selector list would only apply to its last selector. The browser provides the top layer, focus trapping, `Esc`, focus return and `returnValue`, so none of these are reimplemented.
- `popup.js` only adds declarative triggers: `data-popup-open="id"` and `data-popup-close="value"`. Invoker commands (`command`/`commandfor`) also work with a popup where the browser supports them; the data attributes exist so that triggers work in browsers that do not.
- Closing on an outside click follows the native `closedby="any"` attribute. In browsers that implement it the dialog is already closed when `popup.js` sees the click, so the script does nothing; in others the script does the same thing. A popup without `closedby="any"` never closes on an outside click.
- Open and close animations use `@starting-style` and `transition-behavior: allow-discrete`. Browsers without them open and close instantly.

## Toast

- `toast.js` creates one container (`<section aria-live="polite">`) in `<body>` on first use. `<body>` is not replaced by page transitions, so toasts survive navigation.
- `warning` and `error` toasts have `role="alert"`; others rely on the container's polite live region, which avoids reading them twice.
- The timer pauses while the toast is hovered or focused. Pauses are tracked by reason (`pointer`, `focus`, `manual`) so leaving with the pointer does not resume a toast that still has focus.
- The container is kept in the top layer with `TopLayer` (layer `0`), so it stays visible above an open modal popup.
- Closing waits for the element's transitions (`getAnimations()`) before removing it, so the duration is controlled from CSS only.

## Sidebar

- `.sidebar` is a `<nav popover>` placed before `<main>`. On large screens the CSS overrides the popover's UA `display: none`, so it is always shown, fixed at the inline start, and `.sidebar ~ main` is shifted by `--sidebar-width`. On small screens (`max-width: 768px`, the same breakpoint as `small:`) it is a normal popover opened by `popovertarget`. The browser provides opening, light dismiss, `Esc`, the top layer and `aria-expanded` on the toggle, so none of these are reimplemented. A dialog was not used because a modal dialog cannot be shown without a script, and the sidebar must not trap focus on large screens.
- `--sidebar-width` is read by both the sidebar and `main`, which are siblings, so it must be set on a common ancestor such as `:root`.
- The sidebar is outside `header` and `main`, so `view-transition.js` keeps it across page transitions (scroll position and `<details>` state stay). Because of this, `aria-current="page"` written in the HTML would go stale, and `sidebar.js` sets it again on `init`/`reinit` by comparing each link's origin, path and query with `location`. It only removes `aria-current` when its value is `page`, so other values written by the author are kept. Relative URLs in the kept sidebar resolve against the new page, so links must be root-relative or absolute. Pages with different sidebars can add `'#sidebar'` to `PageTransition`'s `regions`.
- `sidebar.js` closes the popover when a link inside it is clicked (same-document `#id` links do not call `cleanup()`), on `cleanup()`, and when the `media` option stops matching. Without the last one, a popover left open while the window grows would stay in the top layer above the header.
- CSS media queries cannot read custom properties, so the breakpoint is written both in `sidebar.css` and in the `media` option. Changing it means changing both.
- Without popover support (no `:popover-open`), the sidebar is hidden on small screens and works as usual on large screens. The `:popover-open` rules are kept apart from the others because an unknown pseudo-class invalidates the whole selector list.

## Hero

- `main > .hero` cancels `main`'s padding with negative margins instead of using `100vw`. `100vw` includes the scrollbar and ignores anything beside `main` (such as the sidebar), so it overflowed horizontally. A hero outside `main` still uses `100vw`.

## Top layer

Modal dialogs (Popup) and popovers are drawn in the browser's top layer, above every `z-index`. Elements that must stay above them (the toast container, the cursor and the loading overlay) are registered with `window.nercone.topLayer` (class `TopLayer` in `initializer.js`):

```js
window.nercone.topLayer.add(element, order); // makes element a manual popover and shows it
window.nercone.topLayer.remove(element);
```

- Whenever a modal dialog or popover that is not registered opens (`toggle` event), every registered element is shown again in ascending `order`, which moves it to the top of the top layer. The larger the order, the higher the element: toast `0`, cursor `1`, loading overlay `2` (the `layer` option of each script).
- One shared manager is required. If each script re-raised itself on `toggle`, two of them would keep re-raising each other forever, because showing a popover fires `toggle` too. Events from registered elements are ignored for this reason.
- Showing an element again restarts `@starting-style` transitions inside it, so toasts already on screen play their entry transition again when a popup opens.
- Each registered element's CSS resets the popover UA styles (`margin`, `border`, `padding`, `inset`, size, `overflow`). Where popovers are not supported, nothing changes and `z-index` applies as before.
