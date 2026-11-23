import {
  createChange,
  createRovingFocus,
  createTransfer,
  definePrimitive,
  spatialMove,
  transferMessage,
  type ChangeDetails,
  type TransferDraft,
  type TransferLists,
  type TransferMessage,
  type TransferReason,
} from "@ui-sdk/core"

// The week as lists of cards, one list a day, keyed by the day's date, so a card can be moved to another day with
// the pointer or the keyboard. The app owns the lists: a move only shows once the app passes lists with the card in
// its new day.

type MoveDetails = ChangeDetails<TransferReason> & { key: string; from: string; to: string; index: number }

type WeekBoardOptions = {
  lists?: TransferLists
  defaultLists?: TransferLists
  onListsChange?: (lists: TransferLists, details: MoveDetails) => void
  // Whether a day takes the card: never a day that has passed.
  accepts?: (key: string, day: string) => boolean
  // Whether a card can't be picked up, like one already sent, or one whose move is still saving.
  locked?: (key: string) => boolean
  // What screen readers call a card and a day, and what they hear as a card moves.
  label?: (key: string) => string | undefined
  dayLabel?: (day: string) => string | undefined
  message?: (message: TransferMessage) => string
}

// A day shows its cards in time order, so while one is picked up, a place within its day means nothing.
const WITHIN_A_DAY = new Set(["ArrowUp", "ArrowDown", "Home", "End"])

const weekBoard = definePrimitive({
  name: "week-board",
  options: {
    lists: "value",
    defaultLists: "value",
    onListsChange: "callback",
    accepts: "action",
    locked: "action",
    label: "action",
    dayLabel: "action",
    message: "action",
  },
  controlled: ["lists"],
  state: (options: WeekBoardOptions) => ({
    lists: options.lists ?? options.defaultLists ?? {},
    moving: null as TransferDraft | null,
    focused: null as string | null,
  }),
  sync: (options) => (options.lists === undefined ? {} : { lists: options.lists }),
  api: (context) => {
    const change = createChange(context)
    const accepts = (key: string, day: string) => context.options().accepts?.(key, day) ?? true
    const locked = (key: string) => context.options().locked?.(key) ?? false
    const transfer = createTransfer(context, {
      key: "lists",
      draft: "moving",
      set: (value, details) => change("lists", value, details),
      accepts,
      disabled: locked,
      label: (key) => context.options().label?.(key),
      listLabel: (day) => context.options().dayLabel?.(day),
      message: (message) => context.options().message?.(message) ?? transferMessage(message),
      createAutoScroll: false,
    })
    // One tab stop for the whole week. The arrows go to the nearest card that way on screen: across the days in
    // columns, and up and down when they stack on a phone.
    const roving = createRovingFocus(context, { slot: "card", key: "focused", move: spatialMove() })

    const keydown = (event: KeyboardEvent, key: string, el: HTMLElement) => {
      if (context.store.get().moving && WITHIN_A_DAY.has(event.key)) return event.preventDefault()
      if (!transfer.keydown(event, key)) roving.keydown(event, el)
    }

    return {
      transfer,
      roving,
      locked,
      keydown,
      // While a card is picked up, the days that won't take it.
      refuses: (state: { moving: TransferDraft | null }, day: string) => state.moving !== null && !accepts(state.moving.key, day),
    }
  },
  slots: (slot) => ({
    root: slot({}),
    // A day, and the cards it shows: the draft's while one moves, so the moving card's place shows where it lands.
    list: slot<{ value: string }, { cards: string[] }>({
      props: { value: "string" },
      state: (state, part) => ({ cards: part.api.transfer.lists(state)[part.key] ?? [] }),
      attrs: (state, part) => ({ "data-refuses": part.api.refuses(state, part.key) ? "" : undefined }),
      bind: (el, { api, key }) => api.transfer.bindList(el, key),
    }),
    // A day's cards, named after the day by the app.
    cards: slot({
      role: "listbox",
      keys: { none: "Its cards take the arrows, Space, Enter and Escape: one tab stop for the whole week." },
    }),
    card: slot<{ value: string }>({
      role: "option",
      focus: "roving",
      keys: ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", " ", "Enter", "Escape", "Tab"],
      press: { none: "Space and Enter pick the card up, in keydown. A click alone does nothing: a drag starts once it moves." },
      props: { value: "string" },
      attrs: (state, part) => ({
        tabindex: part.api.roving.tabIndex(state, part),
        "aria-roledescription": "reminder",
        "aria-selected": String(part.api.transfer.moving(state, part.key)),
        "data-locked": part.api.locked(part.key) ? "" : undefined,
      }),
      on: {
        keydown: (event, { api, key, el }) => {
          if (el) api.keydown(event as KeyboardEvent, key, el)
        },
        pointerdown: (event, { api, key }) => api.transfer.pointerdown(event, key),
      },
      bind: (el, part) => {
        const leave = [part.api.roving.bind(el, part), part.api.transfer.bindItem(el, part.key)]
        return () => leave.forEach((cleanup) => cleanup())
      },
    }),
  }),
})

export { weekBoard, type MoveDetails, type WeekBoardOptions }
