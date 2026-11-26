import { z } from "zod";
import { CATEGORIES } from "@/lib/categories";

const time24 = /^([01]\d|2[0-3]):[0-5]\d$/;

export const listRemindersInput = z
  .strictObject({
    from: z.iso
      .date()
      .describe("First day to list, as a local date, e.g. 2026-11-20"),
    to: z.iso
      .date()
      .describe(
        "Last day to list, included, e.g. 2026-11-22. Must not be before from.",
      ),
    includeCancelled: z
      .boolean()
      .optional()
      .describe(
        "true to also list cancelled reminders. Leave it out otherwise.",
      ),
  })
  .refine((v) => v.to >= v.from, "to must not be before from");

export const createReminderInput = z.strictObject({
  title: z
    .string()
    .trim()
    .min(1, "Add a title")
    .max(200)
    .describe("What to be reminded about, short, e.g. Call Dad"),
  description: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .describe(
      "Extra details, only if the user gave some, e.g. Ask about his trip",
    ),
  date: z.iso.date().describe("The local date, e.g. 2026-11-20"),
  time: z
    .string()
    .regex(time24)
    .describe("The local time, 24-hour, e.g. 18:00 for 6 pm"),
category: z.enum(CATEGORIES).describe(
  "What kind of reminder it is, e.g. health for doctor or medicine, work for meetings or invoices, message for texts, emails or replies. Pick other only when nothing else fits."
),

});

export const changeReminderInput = z
  .strictObject({
    id: z
      .uuid()
      .describe(
        "The id of the reminder to change, from listReminders. Send at least one change with it.",
      ),
    title: z
      .string()
      .trim()
      .min(1, "Add a title")
      .max(200)
      .optional()
      .describe("The new title, e.g. Call Mum"),
    description: z
      .string()
      .max(2000)
      .nullable()
      .optional()
      .describe("The new details, or null to remove them"),
    date: z.iso
      .date()
      .optional()
      .describe(
        "The new local date, e.g. 2026-11-21. Leave it out to keep the date.",
      ),
    time: z
      .string()
      .regex(time24)
      .optional()
      .describe(
        "The new local time, 24-hour, e.g. 19:00. Leave it out to keep the time.",
      ),
      category: z.enum(CATEGORIES).optional().describe("The new kind of reminder. Leave it out to keep it."),
  })
  .refine(
    (v) =>
      v.title !== undefined ||
      v.description !== undefined ||
      v.date !== undefined ||
      v.time !== undefined ||
      v.category !== undefined,
    "Send at least one change",
  );

export const cancelReminderInput = z.strictObject({
  id: z.uuid().describe("The id of the reminder to cancel, from listReminders"),
});

export const restoreReminderInput = z.strictObject({
  id: z
    .uuid()
    .describe(
      "The id of the cancelled reminder to bring back, from listReminders",
    ),
});

export const notUnderstoodInput = z.strictObject({
  reason: z.enum(["gibberish", "off-topic", "too-vague"]).describe("Why the message can't become an action, a question or a list"),
});
