import type { ReactNode } from "react";
import { Brand } from "./brand";
import { GlobalSearch } from "./global-search";
import { MainNav } from "./main-nav";

/** Navbar: brand + nav left, search + actions right. Nav drops to its own row below lg. */
export function AppHeader({ actions }: { actions?: ReactNode }) {
  return (
    <header className="sticky top-0 z-50 w-full shrink-0 border-b border-border/60 bg-bg">
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:h-[72px]">
        <div className="flex items-center gap-8">
          <Brand />
          <MainNav className="hidden lg:flex" />
        </div>

        <div className="flex items-center gap-3">
          <GlobalSearch className="hidden w-56 md:flex xl:w-64" />
          {actions}
        </div>
      </div>

      <div className="scrollbar-none overflow-x-auto border-t border-border/60 px-4 py-2 lg:hidden">
        {/* scroll row would clip dropdown */}
        <MainNav className="w-max" withMore={false} />
      </div>
    </header>
  );
}
