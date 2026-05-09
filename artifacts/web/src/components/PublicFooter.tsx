export function PublicFooter() {
  return (
    <footer
      className="border-t border-white/[0.06] px-5 py-8 sm:px-8"
      data-testid="public-footer"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 text-[11px] sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[#7B8694]">
          Powered by{" "}
          <span className="font-medium text-[#B8C5D0]">
            Eride Dogma Support Centre
          </span>
        </p>
        <p className="font-mono uppercase tracking-[0.24em] text-[#7B8694]">
          Structured support · Controlled resolution
        </p>
      </div>
    </footer>
  );
}
