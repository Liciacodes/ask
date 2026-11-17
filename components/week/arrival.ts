// The save moment: a copy of the new card lifts out of the closing bar and flies to its slot in the week,
// the cards below it make room, then a highlighter draws across its title. Under 800ms in all.
// Only transform, opacity and clip-path move.

const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)" // the --ease-out token in globals.css
const APPEAR_MS = 90 // the copy fades in over the form
const SHRINK_MS = 180 // ...and shrinks to card size, lifted slightly
const FLIGHT_MS = 520 // ...then flies to its slot and settles
const ROOM_AT_MS = 220 // the cards below start making room, finishing as it lands
const ROOM_MS = 300
const DRAW_MS = 200 // the highlighter, from the moment it lands
const FADE_MS = 150 // reduced motion, or a slot that isn't on screen
const LIFT = 1.03

type Rects = Map<string, DOMRect>

const cardsIn = (week: HTMLElement) => [...week.querySelectorAll<HTMLElement>("[data-id]")]

// Every card's position before the new one is added, so the ones that move can slide from where they were.
function cardRects(week: HTMLElement): Rects {
  return new Map(cardsIn(week).map((card) => [card.dataset.id!, card.getBoundingClientRect()]))
}

const centre = (rect: DOMRect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })

function onScreen(rect: DOMRect) {
  return rect.top >= 0 && rect.left >= 0 && rect.bottom <= innerHeight && rect.right <= innerWidth
}

function drawHighlighter(marker: HTMLElement, delay = 0) {
  return marker.animate([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }], {
    duration: DRAW_MS,
    delay,
    easing: EASE_OUT,
    fill: "backwards",
  })
}

type ArrivalParts = { week: HTMLElement; id: string; from: DOMRect; before: Rects }

function playArrival({ week, id, from, before }: ArrivalParts) {
  const card = week.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)
  if (!card) return () => {}
  const marker = card.querySelector<HTMLElement>("[data-marker]")
  const to = card.getBoundingClientRect()
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches
  const animations: Animation[] = []
  const stop = () => {
    for (const animation of animations) animation.cancel()
    card.style.opacity = ""
  }

  // No flight: under reduced motion, or when the slot is off screen and there's nowhere to watch it land.
  if (reduced || !onScreen(to)) {
    animations.push(card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: EASE_OUT }))
    if (marker) {
      animations.push(
        reduced
          ? marker.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: EASE_OUT })
          : drawHighlighter(marker, FADE_MS)
      )
    }
    return stop
  }

  // The flying copy: the new card's own markup, raised into the top layer above the closing bar.
  const flying = card.cloneNode(true) as HTMLElement
  flying.querySelector("[data-marker]")?.remove()
  flying.removeAttribute("data-id")
  flying.dataset.flying = ""
  flying.setAttribute("aria-hidden", "true")
  flying.popover = "manual"
  Object.assign(flying.style, {
    position: "fixed",
    inset: "auto",
    margin: "0",
    left: `${to.left}px`,
    top: `${to.top}px`,
    width: `${to.width}px`,
    height: `${to.height}px`,
    overflow: "visible",
    color: "var(--ink)",
    transformOrigin: "center",
  })
  document.body.append(flying)
  flying.showPopover()
  card.style.opacity = "0"

  const start = centre(from)
  const end = centre(to)
  const timing = (duration: number, delay = 0): KeyframeAnimationOptions => ({ duration, delay, easing: EASE_OUT, fill: "backwards" })

  const flight = flying.animate(
    [
      { transform: `translate(${start.x - end.x}px, ${start.y - end.y}px) scale(${from.width / to.width}, ${from.height / to.height})`, easing: EASE_OUT },
      { offset: SHRINK_MS / FLIGHT_MS, transform: `translate(${start.x - end.x}px, ${start.y - end.y}px) scale(${LIFT})`, easing: EASE_OUT },
      { transform: "translate(0, 0) scale(1)" },
    ],
    { duration: FLIGHT_MS, easing: "linear" }
  )
  animations.push(flight, flying.animate([{ opacity: 0 }, { opacity: 1 }], timing(APPEAR_MS)))
  for (const line of flying.children) {
    animations.push((line as HTMLElement).animate([{ opacity: 0 }, { opacity: 1 }], timing(SHRINK_MS - APPEAR_MS, APPEAR_MS)))
  }

  // The cards below, in the same day, slide down from where they were.
  for (const other of cardsIn(card.parentElement!)) {
    const was = before.get(other.dataset.id!)
    const shift = was ? was.top - other.getBoundingClientRect().top : 0
    if (other === card || Math.abs(shift) < 0.5) continue
    animations.push(other.animate([{ transform: `translateY(${shift}px)` }, { transform: "translateY(0)" }], timing(ROOM_MS, ROOM_AT_MS)))
  }

  // Scheduled now, not when the flight's promise settles: waiting would add a frame and push past 800ms.
  if (marker) animations.push(drawHighlighter(marker, FLIGHT_MS))

  const land = () => {
    card.style.opacity = ""
    flying.remove()
  }
  flight.finished.then(land, () => flying.remove())

  return () => {
    stop()
    flying.remove()
  }
}

export { cardRects, playArrival }
