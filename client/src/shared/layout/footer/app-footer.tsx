import { REPO_URL } from "@/shared/config/navigation";

const LINK = "text-fg-muted transition-colors hover:text-fg";

export function AppFooter() {
  return (
    <footer className="flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border px-4 py-1.5 text-[13px] sm:px-6">
      <span className="text-fg-subtle">Built on NEAR</span>
      <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
        GitHub
      </a>
    </footer>
  );
}
