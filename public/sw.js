// Ask's service worker: it shows a reminder when its push arrives, even with no Ask tab open, and opens Ask when the
// notification is clicked. It caches nothing.

// "Friday 27 Nov, 6:00 PM": in the browser's own language, on the reminder's own clock, like the cards and the bar.
function whenOf(dueAt, timeZone) {
  const at = new Date(dueAt)
  try {
    const weekday = new Intl.DateTimeFormat(undefined, { weekday: "long", timeZone }).format(at)
    const day = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", timeZone }).format(at)
    const time = new Intl.DateTimeFormat(undefined, { timeStyle: "short", timeZone }).format(at)
    return `${weekday} ${day}, ${time}`
  } catch {
    return at.toLocaleString()
  }
}

self.addEventListener("push", (event) => {
  let reminder = null
  try {
    reminder = event.data ? event.data.json() : null
  } catch {
    reminder = null
  }
  if (!reminder || typeof reminder.title !== "string") return
  event.waitUntil(
    self.registration.showNotification(reminder.title, {
      body: whenOf(reminder.due_at, reminder.timezone),
      // One notification per reminder: a second for the same one would replace the first, never stack.
      tag: `reminder-${reminder.id}`,
      icon: "/icon/192",
      data: { url: "/" },
    })
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      const ask = windows.find((client) => new URL(client.url).origin === self.location.origin)
      if (ask) return ask.focus()
      return self.clients.openWindow("/")
    })()
  )
})
