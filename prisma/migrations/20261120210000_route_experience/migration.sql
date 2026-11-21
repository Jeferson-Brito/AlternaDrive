CREATE TABLE "RouteExperience" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "leg" INTEGER NOT NULL,
    "fromLat" REAL NOT NULL,
    "fromLon" REAL NOT NULL,
    "toLat" REAL NOT NULL,
    "toLon" REAL NOT NULL,
    "checkpoints" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RouteExperience_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RouteExperience_journeyId_leg_key" ON "RouteExperience"("journeyId", "leg");
CREATE INDEX "RouteExperience_fromLat_fromLon_toLat_toLon_idx" ON "RouteExperience"("fromLat", "fromLon", "toLat", "toLon");
