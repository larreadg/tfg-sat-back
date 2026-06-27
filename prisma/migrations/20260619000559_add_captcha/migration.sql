-- CreateTable
CREATE TABLE "Captcha" (
    "id" SERIAL NOT NULL,
    "ip" TEXT NOT NULL,
    "captcha" TEXT NOT NULL,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Captcha_pkey" PRIMARY KEY ("id")
);
