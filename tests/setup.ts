const { DATABASE_URL, TEST_DATABASE_URL } = process.env

// The API tests empty the reminders table. `npm run test:api` points DATABASE_URL at the test database first.
if (!TEST_DATABASE_URL || DATABASE_URL !== TEST_DATABASE_URL) {
  throw new Error("Run these tests with `npm run test:api`, which points them at TEST_DATABASE_URL.")
}
