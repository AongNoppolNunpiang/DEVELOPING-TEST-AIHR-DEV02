-- CreateTable
CREATE TABLE "info" (
    "id" TEXT NOT NULL,
    "line_number" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "drawing_number" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "material" TEXT NOT NULL,
    "inservice_date" DATE NOT NULL,
    "pipe_size" DECIMAL(6,3) NOT NULL,
    "original_thickness" DECIMAL(8,3) NOT NULL,
    "stress" INTEGER NOT NULL,
    "joint_efficiency" INTEGER NOT NULL,
    "ca" INTEGER NOT NULL,
    "design_life" INTEGER NOT NULL,
    "design_pressure" INTEGER NOT NULL,
    "operating_pressure" INTEGER NOT NULL,
    "design_temperature" INTEGER NOT NULL,
    "operating_temperature" INTEGER NOT NULL,

    CONSTRAINT "info_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cml" (
    "id" TEXT NOT NULL,
    "info_id" TEXT NOT NULL,
    "cml_number" INTEGER NOT NULL,
    "cml_description" TEXT NOT NULL,
    "actual_outside_diameter" DECIMAL(8,3),
    "design_thickness" DECIMAL(8,3),
    "structural_thickness" DECIMAL(8,3),
    "required_thickness" DECIMAL(8,3),

    CONSTRAINT "cml_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_point" (
    "id" TEXT NOT NULL,
    "cml_id" TEXT NOT NULL,
    "tp_number" INTEGER NOT NULL,
    "tp_description" INTEGER NOT NULL,
    "note" TEXT,

    CONSTRAINT "test_point_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thickness" (
    "id" TEXT NOT NULL,
    "test_point_id" TEXT NOT NULL,
    "inspection_date" DATE NOT NULL,
    "actual_thickness" DECIMAL(8,3) NOT NULL,

    CONSTRAINT "thickness_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "info_line_number_key" ON "info"("line_number");

-- CreateIndex
CREATE UNIQUE INDEX "cml_info_id_cml_number_key" ON "cml"("info_id", "cml_number");

-- CreateIndex
CREATE UNIQUE INDEX "test_point_cml_id_tp_number_key" ON "test_point"("cml_id", "tp_number");

-- CreateIndex
CREATE UNIQUE INDEX "thickness_test_point_id_inspection_date_key" ON "thickness"("test_point_id", "inspection_date");

-- AddForeignKey
ALTER TABLE "cml" ADD CONSTRAINT "cml_info_id_fkey" FOREIGN KEY ("info_id") REFERENCES "info"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_point" ADD CONSTRAINT "test_point_cml_id_fkey" FOREIGN KEY ("cml_id") REFERENCES "cml"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thickness" ADD CONSTRAINT "thickness_test_point_id_fkey" FOREIGN KEY ("test_point_id") REFERENCES "test_point"("id") ON DELETE CASCADE ON UPDATE CASCADE;
