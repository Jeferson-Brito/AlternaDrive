ALTER TABLE "User" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "suspended" BOOLEAN NOT NULL DEFAULT false;

UPDATE "User" SET "isAdmin" = true WHERE "email" = 'jeffersonbrito2455@gmail.com';

CREATE TABLE "ManualRoute" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "fromLat" REAL NOT NULL,
  "toLat" REAL NOT NULL,
  "south" REAL NOT NULL,
  "north" REAL NOT NULL,
  "west" REAL NOT NULL,
  "east" REAL NOT NULL,
  "points" JSONB NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ManualRoute_fromLat_toLat_idx" ON "ManualRoute"("fromLat", "toLat");
