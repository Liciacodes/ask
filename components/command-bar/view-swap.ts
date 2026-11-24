// Crossfades the bar between two views while its card eases to the new height.
// Only transform, opacity, clip-path and a 2px blur move; the card's real height changes at once.

const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)" // the --ease-out token in globals.css
const SWAP_MS = 180
const REDUCED_MS = 120

type SwapParts = { panel: HTMLElement; paper: HTMLElement; footer: HTMLElement; hints: HTMLElement; view: HTMLElement }
type Snapshot = { copy: HTMLElement; paperHeight: number; footerTop: number; opacity: number }

// Where the card is on screen right now, even mid-swap, plus a frozen copy of the view that's leaving.
// Take it before stopping a running swap, so the next one starts from what the person actually sees.
function snapshot({ paper, footer, view }: Omit<SwapParts, "panel" | "hints">): Snapshot {
  const paperHeight = paper.getBoundingClientRect().height
  const footerTop = footer.getBoundingClientRect().top
  const opacity = Number(getComputedStyle(view).opacity)

  const copy = view.cloneNode(true) as HTMLElement
  const typed = view.querySelectorAll("input")
  copy.querySelectorAll("input").forEach((input, i) => (input.value = typed[i]?.value ?? ""))
  for (const el of [copy, ...copy.querySelectorAll("[id]")]) el.removeAttribute("id")
  copy.inert = true
  copy.setAttribute("aria-hidden", "true")
  copy.dataset.leaving = ""
  // The bar is docked at the bottom, so a view sits just above the footer and the card's top edge is what moves.
  Object.assign(copy.style, { position: "absolute", top: "auto", left: "0", right: "0", pointerEvents: "none", transformOrigin: "bottom center" })
  return { copy, paperHeight, footerTop, opacity }
}

// The new view's parts settle their layout after React's commit (UI SDK hides filtered rows in a second pass),
// so measure in the next animation frame: it runs after all of that and before the browser paints.
function playSwap(parts: SwapParts, snap: Snapshot) {
  let animations: Animation[] = []
  const frame = requestAnimationFrame(() => (animations = startSwap(parts, snap)))
  return () => {
    cancelAnimationFrame(frame)
    for (const animation of animations) animation.cancel()
    snap.copy.remove()
  }
}

function startSwap({ panel, paper, footer, hints, view }: SwapParts, { copy, paperHeight, footerTop, opacity }: Snapshot) {
  copy.style.bottom = `${footer.offsetHeight}px`
  panel.prepend(copy)
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches
  const timing: KeyframeAnimationOptions = { duration: reduced ? REDUCED_MS : SWAP_MS, easing: EASE_OUT }
  const card = paper.getBoundingClientRect().height
  const grow = card - paperHeight
  const fadeIn: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }]

  const animations = reduced
    ? [copy.animate([{ opacity }, { opacity: 0 }], timing), view.animate(fadeIn, timing), hints.animate(fadeIn, timing)]
    : [
        hints.animate(fadeIn, timing),
        copy.animate(
          [
            { opacity, filter: "blur(0px)", transform: "scale(1)", clipPath: "inset(0 0 0 0)" },
            { opacity: 0, filter: "blur(2px)", transform: "scale(0.98)", clipPath: `inset(${Math.max(0, -grow)}px 0 0 0)` },
          ],
          timing
        ),
        view.animate(
          [
            { opacity: 0, filter: "blur(2px)", transform: "scale(0.98)", clipPath: `inset(${Math.max(0, grow)}px 0 0 0)` },
            { opacity: 1, filter: "blur(0px)", transform: "scale(1)", clipPath: "inset(0 0 0 0)" },
          ],
          timing
        ),
      ]

  if (!reduced && Math.abs(grow) >= 1) {
    animations.push(
      paper.animate([{ transform: `scaleY(${paperHeight / card})` }, { transform: "scaleY(1)" }], timing),
      footer.animate([{ transform: `translateY(${footerTop - footer.getBoundingClientRect().top}px)` }, { transform: "translateY(0)" }], timing)
    )
  }

  const finish = () => copy.remove()
  Promise.all(animations.map((animation) => animation.finished)).then(finish, finish)
  return animations
}

export { playSwap, snapshot, type Snapshot }
