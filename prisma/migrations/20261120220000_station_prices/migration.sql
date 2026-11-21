ALTER TABLE "Entry" ADD COLUMN "fuelUnitPrice" INTEGER;
ALTER TABLE "Entry" ADD COLUMN "stationName" TEXT;
CREATE TABLE "StationPrice" (
    "stationId" TEXT NOT NULL,
    "fuel" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    PRIMARY KEY ("stationId", "fuel")
);
CREATE INDEX "StationPrice_updatedAt_idx" ON "StationPrice"("updatedAt");
