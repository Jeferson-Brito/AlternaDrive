ALTER TABLE "User" ADD COLUMN "defaultFare" INTEGER;
ALTER TABLE "User" ADD COLUMN "defaultOrigin" TEXT;
ALTER TABLE "User" ADD COLUMN "defaultDestination" TEXT;
ALTER TABLE "Journey" ADD COLUMN "startLatitude" REAL;
ALTER TABLE "Journey" ADD COLUMN "startLongitude" REAL;
