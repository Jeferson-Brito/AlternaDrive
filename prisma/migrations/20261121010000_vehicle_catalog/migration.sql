-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Vehicle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'car',
    "referenceFuelPrice" INTEGER,
    "fuel" TEXT NOT NULL,
    "tank" REAL,
    "catalogId" TEXT,
    "cityEfficiency" REAL,
    "highwayEfficiency" REAL,
    "urbanShare" INTEGER NOT NULL DEFAULT 100,
    "efficiency" REAL NOT NULL,
    "capacity" INTEGER NOT NULL,
    CONSTRAINT "Vehicle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Vehicle" ("capacity", "efficiency", "fuel", "id", "name", "referenceFuelPrice", "tank", "type", "userId") SELECT "capacity", "efficiency", "fuel", "id", "name", "referenceFuelPrice", "tank", "type", "userId" FROM "Vehicle";
DROP TABLE "Vehicle";
ALTER TABLE "new_Vehicle" RENAME TO "Vehicle";
CREATE INDEX "Vehicle_userId_idx" ON "Vehicle"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

