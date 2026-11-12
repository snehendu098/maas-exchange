import Link from "next/link";
import { MAIN_NAV } from "@/shared/config/navigation";
import { Enter } from "@/shared/ui/motion/enter";

interface NotFoundViewProps {
  title: string;
  body: string;
  action: { label: string; href: string };
}

/** Shared 404 body: big mono code, message, primary link + other sections. */
export function NotFoundView({ title, body, action }: NotFoundViewProps) {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <Enter className="flex max-w-md flex-col items-center text-center">
        <p className="font-mono text-[11px] tracking-[0.2em] text-fg-muted uppercase">Error 404</p>
        <h1 className="mt-4 font-mono text-[96px] leading-none font-medium tracking-tight text-fg sm:text-[128px]">404</h1>
        <p className="mt-5 text-lg text-fg">{title}</p>
        <p className="mt-2 text-sm leading-relaxed text-fg-muted">{body}</p>
        <Link
          href={action.href}
          className="focus-ring mt-8 inline-flex h-12 items-center rounded-full bg-brand px-6 text-[15px] font-medium text-brand-fg transition-[filter] hover:brightness-95"
        >
          {action.label}
        </Link>
        <nav aria-label="Other pages" className="mt-5 flex items-center gap-5 text-sm">
          {MAIN_NAV.filter((n) => n.href !== action.href).map((n) => (
            <Link key={n.href} href={n.href} className="text-fg-muted transition-colors hover:text-fg">
              {n.label}
            </Link>
          ))}
        </nav>
      </Enter>
    </div>
  );
}
