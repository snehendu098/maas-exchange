// unlisted market resolving at request time
export default function TradeLoading() {
  return (
    <div className="grid flex-1 grid-cols-1 md:min-h-0 xl:grid-cols-[minmax(0,1fr)_420px]" aria-busy="true">
      <div className="flex min-w-0 flex-col">
        <div className="h-[84px] shrink-0 border-b border-border" />
        <div className="min-h-[460px] flex-1 animate-pulse bg-surface-raised/40" />
      </div>
      <div className="border-t border-border xl:border-t-0 xl:border-l" />
    </div>
  );
}
