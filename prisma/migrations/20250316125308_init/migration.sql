-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL,
    "description" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_id_key" ON "User"("id");
