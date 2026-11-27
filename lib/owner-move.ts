import type { Prisma } from "@/lib/generated/prisma/client"

// The one place a guest's things become an account's when they sign in: their reminders and their browsers' push
// subscriptions. Anything else an owner gets later belongs here too, so a change to how owners are told apart
// lands once.
async function moveGuestToAccount(tx: Prisma.TransactionClient, visitor: string, userId: string) {
  await tx.reminder.updateMany({ where: { userId: visitor }, data: { userId } })
  await tx.pushSubscription.updateMany({ where: { ownerId: visitor }, data: { ownerId: userId } })
}

export { moveGuestToAccount }
