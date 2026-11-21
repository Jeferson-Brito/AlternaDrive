ALTER TABLE "Boarding" ADD COLUMN "legIndex" INTEGER;
CREATE INDEX "Boarding_journeyId_legIndex_idx" ON "Boarding"("journeyId", "legIndex");
CREATE TABLE "CompletedLeg" (
  "journeyId" TEXT NOT NULL, "index" INTEGER NOT NULL,
  "arrivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "distanceKm" REAL, "review" TEXT NOT NULL,
  PRIMARY KEY ("journeyId", "index"),
  CONSTRAINT "CompletedLeg_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
