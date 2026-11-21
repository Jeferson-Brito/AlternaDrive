ALTER TABLE "User" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "suspended" BOOLEAN NOT NULL DEFAULT false;

UPDATE "User" SET "isAdmin" = true WHERE "email" = 'jeffersonbrito2455@gmail.com';

CREATE TABLE "ManualRoute" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "fromLat" DOUBLE PRECISION NOT NULL,
  "toLat" DOUBLE PRECISION NOT NULL,
  "south" DOUBLE PRECISION NOT NULL,
  "north" DOUBLE PRECISION NOT NULL,
  "west" DOUBLE PRECISION NOT NULL,
  "east" DOUBLE PRECISION NOT NULL,
  "points" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ManualRoute_fromLat_toLat_idx" ON "ManualRoute"("fromLat", "toLat");
