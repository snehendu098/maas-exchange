export default function TradeLayout({ children }: LayoutProps<"/trade">) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {children}
    </div>
  );
}
