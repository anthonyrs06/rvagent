/** Slim sticky chrome: identity line left, zoom + page position right. */
export function ViewerToolbar({
  recipientLabel,
  zoom,
  currentPage,
  pageCount,
  onZoomIn,
  onZoomOut,
  onFit,
}: {
  recipientLabel: string;
  zoom: number;
  currentPage: number;
  pageCount: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-gray-800 bg-gray-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-3 py-2 sm:px-6">
        <p className="min-w-0 truncate text-xs text-gray-400 sm:text-sm">
          Private document · prepared for{" "}
          <span className="font-medium text-gray-200">{recipientLabel}</span>
        </p>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <div className="flex items-center overflow-hidden rounded-lg border border-gray-800 bg-gray-900">
            <button
              type="button"
              onClick={onZoomOut}
              aria-label="Zoom out"
              className="px-2.5 py-1 text-sm text-gray-300 transition hover:bg-gray-800 hover:text-white"
            >
              −
            </button>
            <span className="w-12 border-x border-gray-800 py-1 text-center text-xs tabular-nums text-gray-300">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={onZoomIn}
              aria-label="Zoom in"
              className="px-2.5 py-1 text-sm text-gray-300 transition hover:bg-gray-800 hover:text-white"
            >
              +
            </button>
          </div>
          <button
            type="button"
            onClick={onFit}
            className="rounded-lg border border-gray-800 bg-gray-900 px-2.5 py-1 text-xs text-gray-300 transition hover:bg-gray-800 hover:text-white"
          >
            Fit
          </button>
          <span className="whitespace-nowrap text-xs tabular-nums text-gray-400">
            Page {Math.min(currentPage + 1, pageCount)} / {pageCount}
          </span>
        </div>
      </div>
    </header>
  );
}
