-- CreateEnum
CREATE TYPE "reminder_category" AS ENUM ('work', 'health', 'call', 'message', 'food', 'travel', 'exercise', 'shopping', 'hobby', 'other');

-- AlterTable
ALTER TABLE "reminders" ADD COLUMN     "category" "reminder_category" NOT NULL DEFAULT 'other';

