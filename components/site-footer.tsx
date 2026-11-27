import Link from "next/link"

// The links to the privacy and terms pages, at the foot of every page. Quiet grey words that turn ink on hover, each a
// 44px tap target with the keyboard's focus ring. `current` marks the page you're on.
function SiteFooter({ current, className = "" }: { current?: "privacy" | "terms"; className?: string }) {
  const link =
    "inline-flex min-h-11 items-center rounded-xl px-2 text-[13px] font-medium text-muted outline-offset-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent aria-[current=page]:text-ink"
  return (
    <footer className={className}>
      <nav aria-label="Legal" className="flex items-center justify-center gap-2">
        <Link href="/privacy" aria-current={current === "privacy" ? "page" : undefined} className={link}>
          Privacy
        </Link>
        <span aria-hidden="true" className="text-muted">
          ·
        </span>
        <Link href="/terms" aria-current={current === "terms" ? "page" : undefined} className={link}>
          Terms
        </Link>
      </nav>
    </footer>
  )
}

export { SiteFooter }
