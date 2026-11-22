CREATE TABLE "BoardingSuggestion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "journeyId" TEXT NOT NULL REFERENCES "Journey"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "boardingId" TEXT
);
CREATE INDEX "BoardingSuggestion_journeyId_status_idx" ON "BoardingSuggestion"("journeyId","status");
