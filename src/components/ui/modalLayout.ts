/**
 * Shared layout for every modal surface (`Dialog` and `AlertDialog`).
 *
 * A modal is always a three-part column: the header and footer are pinned and
 * the body is the only scroll container. Keeping the classes here means a fix
 * lands on every modal at once. Details that are easy to break:
 *
 * - the body owns the scrollbar, so it runs along the modal edge between header
 *   and footer instead of hugging the content or sitting under the close button;
 * - the body's horizontal padding leaves room for the focus ring of full-width
 *   controls, which a scroll container clips otherwise;
 * - `min-h-0` on the body is what lets the header/footer stay put instead of
 *   being pushed out of view by tall content.
 */

/** Position, size limit and animation shared by dialog and alert-dialog content. Width is set per modal. */
export const modalContentClass =
  'fixed left-[50%] top-[50%] z-1000000 flex max-h-[85vh] translate-x-[-50%] translate-y-[-50%] origin-center flex-col overflow-hidden border bg-background shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg';

export const modalHeaderClass = 'flex shrink-0 flex-col gap-1.5 px-6 pb-4 pt-6 text-center sm:text-left';

/**
 * The scrolling region. Override `overflow-y-auto` (e.g. with
 * `flex flex-col overflow-hidden`) when the body hosts its own scroll pane.
 */
export const modalBodyClass = 'min-h-0 flex-1 overflow-y-auto border-y border-border/70 px-6 py-4';

export const modalFooterClass =
  'flex shrink-0 flex-col-reverse gap-2 px-6 pb-4 pt-4 sm:flex-row sm:items-center sm:justify-end';
