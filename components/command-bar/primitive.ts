import {
  createController,
  createListbox,
  createPopup,
  definePrimitive,
  dispatch,
  formatShortcut,
  popupBackdrop,
  popupContent,
  popupState,
  popupTitle,
  selects,
  type ChangeDetails,
  type PopupController,
  type PopupState,
} from "@ui-sdk/core"
import { dialogPreset } from "@ui-sdk/core/dialog"
import { registerShortcut } from "@ui-sdk/core/shortcuts"

type CommandBarOpenReason =
  | "shortcut"
  | "item-press"
  | "escape-key"
  | "outside-press"
  | "focus-out"
  | "imperative"

type CommandBarController = PopupController<unknown, CommandBarOpenReason>

type CommandBarOptions = {
  controller?: CommandBarController
  shortcut?: string
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean, details: ChangeDetails<CommandBarOpenReason>) => void
  onChoose?: (value: string, details: ChangeDetails<"item-press">) => void
}

type CommandBarState = PopupState & {
  query: string
  highlighted: string | null
}

const commandBar = definePrimitive({
  name: "command-bar",
  options: {
    controller: "value",
    shortcut: "string",
    open: "boolean",
    defaultOpen: "boolean",
    onOpenChange: "callback",
    onChoose: "callback",
  },
  state: (options: CommandBarOptions): CommandBarState => ({
    ...popupState(options),
    query: "",
    highlighted: null,
  }),
  api: (context) => {
    const popup = createPopup(context, { preset: dialogPreset })
    const listbox = createListbox(context, {
      key: "highlighted",
      focus: "virtual",
      query: () => context.store.get().query,
    })

    let wasOpen = context.store.get().open
    context.onDestroy(
      context.store.subscribe(() => {
        const { open } = context.store.get()
        if (open === wasOpen) return
        wasOpen = open
        if (open) {
          context.store.set({ query: "" })
          listbox.move("first")
        }
      })
    )

    const shortcut = () => context.options().shortcut ?? "mod+k"

    const search = (query: string, event?: Event) => {
      context.store.set({ query })
      listbox.move("first", event)
    }

    const choose = (value: string | null, event?: Event) => {
      if (value === null) return
      if (dispatch(context, "onChoose", value, { reason: "item-press", event })) return
      popup.close({ reason: "item-press", event })
    }

    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault()
        choose(context.store.get().highlighted, event)
        return
      }
      if (listbox.keydown(event) !== undefined) event.preventDefault()
    }

    return { ...popup, listbox, shortcut, search, choose, keydown }
  },
  slots: (slot) => ({
    root: slot({
      bind: (_el, part) =>
        registerShortcut(
          () => part.api.shortcut(),
          (event) => part.api.setOpen(true, { reason: "shortcut", event }),
          { description: "Open Ask" }
        ),
    }),
    shortcut: slot({
      bind: (el, part) => {
        el.textContent = formatShortcut(part.api.shortcut())
      },
    }),
    backdrop: popupBackdrop(slot),
    content: popupContent(slot),
    title: popupTitle(slot),
    // Ctrl+K while open closes the bar, from the search or the form, instead of reaching the browser's address bar.
    panel: slot({
      bind: (el, part) =>
        registerShortcut(
          () => part.api.shortcut(),
          (event) => part.api.close({ reason: "shortcut", event }),
          { layer: el, description: "Close Ask" }
        ),
    }),
    input: slot({
      role: "combobox",
      focus: "native",
      keys: ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Enter"],
      attrs: (state, part) => ({
        type: "text",
        value: state.query,
        autocomplete: "off",
        spellcheck: "false",
        "aria-autocomplete": "list",
        "aria-expanded": "true",
        "aria-controls": `${part.id}-list`,
        "aria-activedescendant": part.api.listbox.activeId(state),
      }),
      on: {
        input: (event, { api }) => api.search((event.target as HTMLInputElement).value, event),
        keydown: (event, { api }) => api.keydown(event as KeyboardEvent),
      },
    }),
    list: slot({
      role: "listbox",
      keys: { none: "The search input handles them, with aria-activedescendant." },
      attrs: (_state, part) => ({ id: `${part.id}-list`, "aria-label": "Commands" }),
    }),
    item: slot<{ value: string; label?: string }>({
      role: "option",
      focus: "active-descendant",
      props: { value: "string", label: "string" },
      selects: selects({ highlighted: ({ key }) => [key, null] }),
      present: (_state, part) => part.api.listbox.shows(part),
      attrs: (state, part) => ({
        ...part.api.listbox.attrs(state, part),
        "aria-selected": String(state.highlighted === part.key),
      }),
      press: ({ key, api }, event) => api.choose(key, event),
      on: {
        pointerdown: (event) => event.preventDefault(),
        pointermove: (event, { key, api }) => api.listbox.highlight(key, { event }),
      },
      bind: (el, part) => part.api.listbox.bind(el, part),
    }),
    empty: slot<object, { query: string }>({
      present: (_state, part) => part.api.listbox.count() === 0,
      state: (state) => ({ query: state.query }),
    }),
  }),
  agent: { actions: ["setOpen", "search", "choose"] },
})

const createCommandBarController = () => createController<CommandBarController>()

export { commandBar, createCommandBarController, type CommandBarOptions }
