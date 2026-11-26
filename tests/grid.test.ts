import { describe, expect, test } from "vitest"
import { gridHeight, hourLabels, hoursShown, nowTop, placeCards, slotTop } from "@/components/week/grid"

const DEFAULT = { first: 8, last: 23 }

describe("hoursShown", () => {
  test("8:00 to 23:00 when every card fits", () => {
    expect(hoursShown([])).toEqual(DEFAULT)
    expect(hoursShown(["08:00", "12:30", "22:00"])).toEqual(DEFAULT)
    expect(gridHeight(DEFAULT)).toBe(15 * 54)
    expect(hourLabels(DEFAULT)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22])
  })

  test("a 6:30 card starts the grid at 6:00", () => {
    expect(hoursShown(["06:30", "09:00"])).toEqual({ first: 6, last: 23 })
  })

  test("a card's hour that runs past 23:00 ends the grid at its end, never past midnight", () => {
    expect(hoursShown(["22:30"])).toEqual({ first: 8, last: 24 })
    expect(hoursShown(["23:15"])).toEqual({ first: 8, last: 24 })
    expect(hoursShown(["00:30", "23:59"])).toEqual({ first: 0, last: 24 })
  })
})

describe("slotTop", () => {
  test("54px an hour from the first hour shown: 15:30 sits halfway between the 3pm and 4pm lines", () => {
    expect(slotTop("08:00", DEFAULT)).toBe(0)
    expect(slotTop("15:00", DEFAULT)).toBe(7 * 54)
    expect(slotTop("15:30", DEFAULT)).toBe(7.5 * 54)
  })

  test("a card in the hour before midnight rises just enough to fit", () => {
    const hours = { first: 8, last: 24 }
    expect(slotTop("23:00", hours)).toBe(15 * 54)
    expect(slotTop("23:45", hours)).toBe(15 * 54)
  })
})

describe("placeCards", () => {
  const place = (...cards: [id: string, time: string][]) =>
    Object.fromEntries(placeCards(cards.map(([id, time]) => ({ id, time })), DEFAULT))

  test("two at the same time sit side by side, each half the width", () => {
    expect(place(["gym", "18:00"], ["call", "18:00"])).toEqual({
      gym: { top: 540, lane: 0, lanes: 2 },
      call: { top: 540, lane: 1, lanes: 2 },
    })
  })

  test("half an hour apart they still share; an hour apart, each keeps the whole width", () => {
    expect(place(["a", "18:00"], ["b", "18:30"])).toMatchObject({ a: { lanes: 2 }, b: { lanes: 2 } })
    expect(place(["a", "09:00"], ["b", "10:00"])).toMatchObject({ a: { lane: 0, lanes: 1 }, b: { lane: 0, lanes: 1 } })
  })

  test("three overlapping cards take three lanes, and a card on its own keeps the whole width", () => {
    const placed = place(["a", "12:00"], ["b", "12:15"], ["c", "12:30"], ["d", "16:00"])
    expect([placed.a.lanes, placed.b.lanes, placed.c.lanes]).toEqual([3, 3, 3])
    expect(new Set([placed.a.lane, placed.b.lane, placed.c.lane])).toEqual(new Set([0, 1, 2]))
    expect(placed.d).toEqual({ top: 8 * 54, lane: 0, lanes: 1 })
  })
})

describe("nowTop", () => {
  test("at the current minute inside the hours shown, and nowhere outside them", () => {
    expect(nowTop("10:20", DEFAULT)).toBeCloseTo((2 + 20 / 60) * 54)
    expect(nowTop("07:59", DEFAULT)).toBeNull()
    expect(nowTop("23:00", DEFAULT)).toBeNull()
    expect(nowTop("23:30", { first: 8, last: 24 })).toBe(15.5 * 54)
  })
})
