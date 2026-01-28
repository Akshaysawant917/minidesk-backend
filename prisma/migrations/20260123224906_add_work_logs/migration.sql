-- CreateTable
CREATE TABLE "WorkLog" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "WorkLog" ADD CONSTRAINT "WorkLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
