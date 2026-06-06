import { buildStockMovement, calculateBalances, type StockMovement } from "./stock-engine";

export type BatchStatus = "Draft" | "In Production" | "Completed" | "Cancelled";
export type InvoiceStatus = "Draft" | "Approved" | "Sent" | "Paid" | "Cancelled";

export type ManufacturingLine = {
  itemId: string;
  itemName: string;
  itemType: "raw_material" | "packaging";
  expectedQuantity: number;
  actualQuantity: number;
  unit: string;
  unitCost: number;
};

export type ManufacturingBatch = {
  batchNumber: string;
  productId: string;
  productName: string;
  bomName: string;
  batchDate: string;
  status: BatchStatus;
  plannedQuantity: number;
  actualQuantityProduced: number;
  wastageQuantity: number;
  labourCost: number;
  overheadCost: number;
  lines: ManufacturingLine[];
};

export type CustomerInvoiceLine = {
  productId: string;
  productName: string;
  quantity: number;
  sellingPrice: number;
  costPerUnit: number;
};

export type CustomerInvoice = {
  invoiceNumber: string;
  customerName: string;
  invoiceDate: string;
  dueDate: string;
  status: InvoiceStatus;
  lines: CustomerInvoiceLine[];
};

export const manufacturingBatches: ManufacturingBatch[] = [
  {
    batchNumber: "MFG-2026-0001",
    productId: "fg-beef-pie",
    productName: "Beef Pie",
    bomName: "Beef Pie Standard BOM",
    batchDate: "2026-06-01",
    status: "Completed",
    plannedQuantity: 500,
    actualQuantityProduced: 486,
    wastageQuantity: 14,
    labourCost: 1320,
    overheadCost: 380,
    lines: [
      { itemId: "rm-beef", itemName: "Beef", itemType: "raw_material", expectedQuantity: 80, actualQuantity: 83, unit: "kg", unitCost: 96 },
      { itemId: "rm-pastry", itemName: "Pastry", itemType: "raw_material", expectedQuantity: 95, actualQuantity: 97, unit: "kg", unitCost: 29 },
      { itemId: "rm-spice", itemName: "Pie Spice Mix", itemType: "raw_material", expectedQuantity: 4, actualQuantity: 4.2, unit: "kg", unitCost: 145 },
      { itemId: "pk-box", itemName: "Pie Boxes", itemType: "packaging", expectedQuantity: 500, actualQuantity: 486, unit: "units", unitCost: 2.85 },
    ],
  },
  {
    batchNumber: "MFG-2026-0002",
    productId: "fg-chicken-pie",
    productName: "Chicken Pie",
    bomName: "Chicken Pie Standard BOM",
    batchDate: "2026-06-02",
    status: "Completed",
    plannedQuantity: 600,
    actualQuantityProduced: 590,
    wastageQuantity: 10,
    labourCost: 1450,
    overheadCost: 420,
    lines: [
      { itemId: "rm-chicken", itemName: "Chicken", itemType: "raw_material", expectedQuantity: 90, actualQuantity: 91, unit: "kg", unitCost: 72 },
      { itemId: "rm-pastry", itemName: "Pastry", itemType: "raw_material", expectedQuantity: 110, actualQuantity: 112, unit: "kg", unitCost: 29 },
      { itemId: "rm-cheese", itemName: "Cheese", itemType: "raw_material", expectedQuantity: 12, actualQuantity: 12, unit: "kg", unitCost: 118 },
      { itemId: "pk-box", itemName: "Pie Boxes", itemType: "packaging", expectedQuantity: 600, actualQuantity: 590, unit: "units", unitCost: 2.85 },
    ],
  },
  {
    batchNumber: "MFG-2026-0003",
    productId: "fg-mutton-pie",
    productName: "Mutton Pie",
    bomName: "Mutton Pie Premium BOM",
    batchDate: "2026-06-03",
    status: "In Production",
    plannedQuantity: 350,
    actualQuantityProduced: 0,
    wastageQuantity: 0,
    labourCost: 980,
    overheadCost: 260,
    lines: [
      { itemId: "rm-mutton", itemName: "Mutton", itemType: "raw_material", expectedQuantity: 68, actualQuantity: 68, unit: "kg", unitCost: 118 },
      { itemId: "rm-pastry", itemName: "Pastry", itemType: "raw_material", expectedQuantity: 70, actualQuantity: 70, unit: "kg", unitCost: 29 },
      { itemId: "pk-box", itemName: "Pie Boxes", itemType: "packaging", expectedQuantity: 350, actualQuantity: 350, unit: "units", unitCost: 2.85 },
    ],
  },
];

export const customerInvoices: CustomerInvoice[] = [
  {
    invoiceNumber: "INV-CUST-2026-0001",
    customerName: "Local Café Group",
    invoiceDate: "2026-06-03",
    dueDate: "2026-06-10",
    status: "Sent",
    lines: [
      { productId: "fg-beef-pie", productName: "Beef Pie", quantity: 120, sellingPrice: 34.5, costPerUnit: 28.31 },
      { productId: "fg-chicken-pie", productName: "Chicken Pie", quantity: 100, sellingPrice: 32, costPerUnit: 25.22 },
    ],
  },
  {
    invoiceNumber: "INV-CUST-2026-0002",
    customerName: "Farmstall Foods",
    invoiceDate: "2026-06-04",
    dueDate: "2026-06-11",
    status: "Approved",
    lines: [
      { productId: "fg-mutton-pie", productName: "Mutton Pie", quantity: 70, sellingPrice: 42, costPerUnit: 33.95 },
      { productId: "fg-cheese-pie", productName: "Cheese Pie", quantity: 80, sellingPrice: 29.5, costPerUnit: 22.8 },
    ],
  },
  {
    invoiceNumber: "INV-CUST-2026-0003",
    customerName: "Corporate Canteen Supplies",
    invoiceDate: "2026-06-04",
    dueDate: "2026-06-14",
    status: "Paid",
    lines: [
      { productId: "fg-pepper-steak-pie", productName: "Pepper Steak Pie", quantity: 160, sellingPrice: 38.5, costPerUnit: 29.9 },
    ],
  },
];

export function getBatchCost(batch: ManufacturingBatch) {
  const materialCost = batch.lines.reduce((sum, line) => sum + line.actualQuantity * line.unitCost, 0);
  const totalCost = materialCost + batch.labourCost + batch.overheadCost;
  const costPerUnit = batch.actualQuantityProduced > 0 ? totalCost / batch.actualQuantityProduced : 0;
  const expectedCost = batch.lines.reduce((sum, line) => sum + line.expectedQuantity * line.unitCost, 0) + batch.labourCost + batch.overheadCost;
  const variance = totalCost - expectedCost;

  return {
    materialCost: Number(materialCost.toFixed(2)),
    totalCost: Number(totalCost.toFixed(2)),
    costPerUnit: Number(costPerUnit.toFixed(2)),
    expectedCost: Number(expectedCost.toFixed(2)),
    variance: Number(variance.toFixed(2)),
  };
}

export function getInvoiceTotals(invoice: CustomerInvoice) {
  const salesValue = invoice.lines.reduce((sum, line) => sum + line.quantity * line.sellingPrice, 0);
  const costValue = invoice.lines.reduce((sum, line) => sum + line.quantity * line.costPerUnit, 0);
  const grossProfit = salesValue - costValue;
  const gpPercentage = salesValue > 0 ? (grossProfit / salesValue) * 100 : 0;

  return {
    salesValue: Number(salesValue.toFixed(2)),
    costValue: Number(costValue.toFixed(2)),
    grossProfit: Number(grossProfit.toFixed(2)),
    gpPercentage: Number(gpPercentage.toFixed(1)),
  };
}

export function demoStockMovements(): StockMovement[] {
  const openingMovements: StockMovement[] = [
    buildStockMovement({ date: "2026-05-30", itemType: "raw_material", itemId: "rm-beef", itemName: "Beef", movementType: "GRN Receipt", reference: "GRN-0001", quantityIn: 250, quantityOut: 0, unitCost: 96 }),
    buildStockMovement({ date: "2026-05-30", itemType: "raw_material", itemId: "rm-chicken", itemName: "Chicken", movementType: "GRN Receipt", reference: "GRN-0002", quantityIn: 300, quantityOut: 0, unitCost: 72 }),
    buildStockMovement({ date: "2026-05-30", itemType: "raw_material", itemId: "rm-mutton", itemName: "Mutton", movementType: "GRN Receipt", reference: "GRN-0003", quantityIn: 180, quantityOut: 0, unitCost: 118 }),
    buildStockMovement({ date: "2026-05-30", itemType: "raw_material", itemId: "rm-pastry", itemName: "Pastry", movementType: "GRN Receipt", reference: "GRN-0004", quantityIn: 420, quantityOut: 0, unitCost: 29 }),
    buildStockMovement({ date: "2026-05-30", itemType: "packaging", itemId: "pk-box", itemName: "Pie Boxes", movementType: "GRN Receipt", reference: "GRN-0005", quantityIn: 3500, quantityOut: 0, unitCost: 2.85 }),
  ];

  const manufacturingMovements = manufacturingBatches.flatMap((batch) => {
    if (batch.status !== "Completed") return [];
    const cost = getBatchCost(batch);
    return [
      ...batch.lines.map((line) =>
        buildStockMovement({
          date: batch.batchDate,
          itemType: line.itemType,
          itemId: line.itemId,
          itemName: line.itemName,
          movementType: "Manufacturing Consumption",
          reference: batch.batchNumber,
          quantityIn: 0,
          quantityOut: line.actualQuantity,
          unitCost: line.unitCost,
        }),
      ),
      buildStockMovement({
        date: batch.batchDate,
        itemType: "finished_good",
        itemId: batch.productId,
        itemName: batch.productName,
        movementType: "Manufacturing Output",
        reference: batch.batchNumber,
        quantityIn: batch.actualQuantityProduced,
        quantityOut: 0,
        unitCost: cost.costPerUnit,
      }),
    ];
  });

  const salesMovements = customerInvoices.flatMap((invoice) => {
    if (invoice.status === "Draft" || invoice.status === "Cancelled") return [];
    return invoice.lines.map((line) =>
      buildStockMovement({
        date: invoice.invoiceDate,
        itemType: "finished_good",
        itemId: line.productId,
        itemName: line.productName,
        movementType: "Customer Invoice / Sale",
        reference: invoice.invoiceNumber,
        quantityIn: 0,
        quantityOut: line.quantity,
        unitCost: line.costPerUnit,
      }),
    );
  });

  return [...openingMovements, ...manufacturingMovements, ...salesMovements];
}

export const stockBalances = calculateBalances(demoStockMovements());
