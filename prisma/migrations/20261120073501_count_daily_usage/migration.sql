-- CreateTable
CREATE TABLE "daily_usage" (
    "day" DATE NOT NULL,
    "subject" TEXT NOT NULL,
    "questions" INTEGER NOT NULL DEFAULT 0,
    "model_calls" INTEGER NOT NULL DEFAULT 0,
    "tokens" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "daily_usage_pkey" PRIMARY KEY ("day","subject")
);
