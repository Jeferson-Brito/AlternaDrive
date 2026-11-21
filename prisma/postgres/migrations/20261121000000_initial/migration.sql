-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "defaultFare" INTEGER,
    "defaultOrigin" TEXT,
    "defaultDestination" TEXT,
    "defaultPointA" JSONB,
    "defaultPointB" JSONB,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'car',
    "referenceFuelPrice" INTEGER,
    "fuel" TEXT NOT NULL,
    "tank" DOUBLE PRECISION,
    "catalogId" TEXT,
    "cityEfficiency" DOUBLE PRECISION,
    "highwayEfficiency" DOUBLE PRECISION,
    "urbanShare" INTEGER NOT NULL DEFAULT 100,
    "efficiency" DOUBLE PRECISION NOT NULL,
    "capacity" INTEGER NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Journey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activeUserId" TEXT,
    "vehicleId" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "startKm" DOUBLE PRECISION NOT NULL,
    "startLatitude" DOUBLE PRECISION,
    "startLongitude" DOUBLE PRECISION,
    "pointA" JSONB,
    "pointB" JSONB,
    "arrivals" INTEGER NOT NULL DEFAULT 0,
    "turnKm" DOUBLE PRECISION,
    "endKm" DOUBLE PRECISION,
    "efficiency" DOUBLE PRECISION NOT NULL,
    "outboundFuelPrice" INTEGER NOT NULL,
    "returnFuelPrice" INTEGER,
    "fare" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "turnedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Journey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Boarding" (
    "id" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "leg" TEXT NOT NULL,
    "legIndex" INTEGER,
    "count" INTEGER NOT NULL,
    "fare" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Boarding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "liters" DOUBLE PRECISION,
    "fuelUnitPrice" INTEGER,
    "stationName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "userId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("userId","period")
);

-- CreateTable
CREATE TABLE "RouteExperience" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "leg" INTEGER NOT NULL,
    "fromLat" DOUBLE PRECISION NOT NULL,
    "fromLon" DOUBLE PRECISION NOT NULL,
    "toLat" DOUBLE PRECISION NOT NULL,
    "toLon" DOUBLE PRECISION NOT NULL,
    "checkpoints" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RouteExperience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StationPrice" (
    "stationId" TEXT NOT NULL,
    "fuel" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StationPrice_pkey" PRIMARY KEY ("stationId","fuel")
);

-- CreateTable
CREATE TABLE "CompletedLeg" (
    "journeyId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "arrivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "distanceKm" DOUBLE PRECISION,
    "review" TEXT NOT NULL,

    CONSTRAINT "CompletedLeg_pkey" PRIMARY KEY ("journeyId","index")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Vehicle_userId_idx" ON "Vehicle"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Journey_activeUserId_key" ON "Journey"("activeUserId");

-- CreateIndex
CREATE INDEX "Journey_userId_startedAt_idx" ON "Journey"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "Boarding_journeyId_createdAt_idx" ON "Boarding"("journeyId", "createdAt");

-- CreateIndex
CREATE INDEX "Boarding_journeyId_legIndex_idx" ON "Boarding"("journeyId", "legIndex");

-- CreateIndex
CREATE INDEX "Entry_userId_createdAt_idx" ON "Entry"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RouteExperience_fromLat_fromLon_toLat_toLon_idx" ON "RouteExperience"("fromLat", "fromLon", "toLat", "toLon");

-- CreateIndex
CREATE UNIQUE INDEX "RouteExperience_journeyId_leg_key" ON "RouteExperience"("journeyId", "leg");

-- CreateIndex
CREATE INDEX "StationPrice_updatedAt_idx" ON "StationPrice"("updatedAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Journey" ADD CONSTRAINT "Journey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Journey" ADD CONSTRAINT "Journey_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Boarding" ADD CONSTRAINT "Boarding_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteExperience" ADD CONSTRAINT "RouteExperience_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletedLeg" ADD CONSTRAINT "CompletedLeg_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
