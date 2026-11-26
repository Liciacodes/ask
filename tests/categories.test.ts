import { expect, test } from "vitest"
import { CATEGORIES, guessCategory } from "@/lib/categories"
import { ReminderCategory } from "@/lib/generated/prisma/enums"

test("the list matches the database's categories, in the same order", () => {
  expect(CATEGORIES).toEqual(Object.values(ReminderCategory))
})

test.each([
  // Titles from the test sentences and the design.
  ["Call Tobi", "call"],
  ["Call the bank", "call"],
  ["Call dad", "call"],
  ["Text Ada", "message"],
  ["Message Ak", "message"],
  ["Dentist", "health"],
  ["Take my medicine", "health"],
  ["Take my vitamins", "health"],
  ["Lunch with Ada", "food"],
  ["Book flights", "travel"],
  ["Pick up Tobi", "travel"],
  ["Go for a run", "exercise"],
  ["Gym", "exercise"],
  ["Buy milk", "shopping"],
  ["Grocery shopping", "shopping"],
  ["Pick up groceries", "shopping"],
  ["Piano practice", "hobby"],
  ["Team meeting", "work"],
  ["Submit the report", "work"],
  ["Send the invoice", "work"],
  ["Apply to 2 jobs", "work"],
  ["Pay rent", "other"],
  ["Put the bins out", "other"],
])("“%s” is %s", (title, category) => {
  expect(guessCategory(title)).toBe(category)
})

test("a call about work is still a call: the first category with a word in the title wins", () => {
  expect(guessCategory("Call the client about the report")).toBe("call")
})

test.each([
  ["Callback from the bank", "other"],
  ["Dentistry course fees", "other"],
  ["Runway photos", "other"],
])("only whole words count: “%s” is %s", (title, category) => {
  expect(guessCategory(title)).toBe(category)
})

test("case and extra spaces don't matter", () => {
  expect(guessCategory("PICK   UP the kids")).toBe("travel")
  expect(guessCategory("check-up at noon")).toBe("health")
})
