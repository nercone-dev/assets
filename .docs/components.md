# Components

Design decisions for components in `styles/components/` and `scripts/`. Usage examples live in `examples/`.

## Shared rules

- A component is one CSS file and, only when the browser cannot do the job alone, one script with the same name.
- Colors come from `--color-{component}-*` variables defined in `styles/colors.css` (`/* Semantic (Components) */`). Sizes come from `--{component}-*` variables with a fallback in the component's CSS, so they can be overridden on any element.
- Scripts register an instance with `window.nercone.register(name, instance)` and can be reached with `window.nercone.get(name)`. Each class is also exposed (`window.nercone.Slider` etc.) so a user can register a new instance with other options under the same name.
- `<main>` is kept across page transitions (`view-transition.js` replaces its contents only), so scripts listen on `document` (one listener, guarded by an `AbortController`) instead of on elements that may be replaced.

## Slider

- `.slider` styles `<input type="range">`. The filled part is a background gradient on the input itself, sized by `--slider-thickness`; the tracks are transparent. This draws the same way in every engine, unlike `::-moz-range-progress`, which only exists in Firefox.
- The fill ends at the thumb's center: `thumb / 2 + ratio * (100% - thumb)`.
- CSS cannot read an input's current value, so `slider.js` writes `--slider-value` (0 to 1). It updates on `input`, `change`, form `reset`, added nodes, and changes to the `value`/`min`/`max` attributes. Setting `.value` from a script fires none of these; call `window.nercone.get('slider').update(element)` after doing so.
- Without the script the slider still works, only without the fill.

## Table

- `.table` on `<table>`; `table-striped`, `table-hover` and `table-bordered` can be combined. `table-numeric` on a cell aligns numbers to the end with tabular figures.
- `table-scroll` is a wrapper rather than `display: block` on the table, because changing a table's display removes its table semantics in some screen readers.

## Popup

- `.popup` styles a native `<dialog>`. The browser provides the top layer, focus trapping, `Esc`, focus return and `returnValue`, so none of these are reimplemented.
- `popup.js` only adds declarative triggers: `data-popup-open="id"` and `data-popup-close="value"`. Invoker commands (`command`/`commandfor`) also work with `.popup` where the browser supports them; the data attributes exist so that triggers work in browsers that do not.
- Closing on an outside click follows the native `closedby="any"` attribute. In browsers that implement it the dialog is already closed when `popup.js` sees the click, so the script does nothing; in others the script does the same thing. A popup without `closedby="any"` never closes on an outside click.
- Open and close animations use `@starting-style` and `transition-behavior: allow-discrete`. Browsers without them open and close instantly.

## Toast

- `toast.js` creates one container (`<section aria-live="polite">`) in `<body>` on first use. `<body>` is not replaced by page transitions, so toasts survive navigation.
- `warning` and `error` toasts have `role="alert"`; others rely on the container's polite live region, which avoids reading them twice.
- The timer pauses while the toast is hovered or focused. Pauses are tracked by reason (`pointer`, `focus`, `manual`) so leaving with the pointer does not resume a toast that still has focus.
- The container is kept in the top layer with `TopLayer` (layer `0`), so it stays visible above an open modal popup.
- Closing waits for the element's transitions (`getAnimations()`) before removing it, so the duration is controlled from CSS only.

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
