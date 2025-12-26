import Dexie, { type EntityTable } from 'dexie';
import type {
  Brand,
  Model,
  Variant,
  Customer,
  Supplier,
  Warehouse,
  StockMove,
  SalesInvoice,
  SalesItem,
  PurchaseInvoice,
  PurchaseItem,
  Payment,
  User,
  Shift,
  AuditLog,
  Setting,
  ReturnInvoice,
  ReturnItem,
} from '@/types';

// Database class
class HoorDatabase extends Dexie {
  // Tables
  brands!: EntityTable<Brand, 'id'>;
  models!: EntityTable<Model, 'id'>;
  variants!: EntityTable<Variant, 'id'>;
  customers!: EntityTable<Customer, 'id'>;
  suppliers!: EntityTable<Supplier, 'id'>;
  warehouses!: EntityTable<Warehouse, 'id'>;
  stockMoves!: EntityTable<StockMove, 'id'>;
  salesInvoices!: EntityTable<SalesInvoice, 'id'>;
  salesItems!: EntityTable<SalesItem, 'id'>;
  purchaseInvoices!: EntityTable<PurchaseInvoice, 'id'>;
  purchaseItems!: EntityTable<PurchaseItem, 'id'>;
  payments!: EntityTable<Payment, 'id'>;
  users!: EntityTable<User, 'id'>;
  shifts!: EntityTable<Shift, 'id'>;
  auditLogs!: EntityTable<AuditLog, 'id'>;
  settings!: EntityTable<Setting, 'id'>;
  returnInvoices!: EntityTable<ReturnInvoice, 'id'>;
  returnItems!: EntityTable<ReturnItem, 'id'>;

  constructor() {
    super('HoorPOS');
    
    this.version(1).stores({
      // Products
      brands: '++id, name, isActive, syncStatus',
      models: '++id, brandId, name, category, isActive, syncStatus',
      variants: '++id, modelId, sku, barcode, color, size, isActive, syncStatus',
      
      // Contacts
      customers: '++id, name, phone, syncStatus',
      suppliers: '++id, name, phone, syncStatus',
      
      // Inventory
      warehouses: '++id, name, isDefault',
      stockMoves: '++id, date, variantId, refType, refId, syncStatus',
      
      // Sales
      salesInvoices: '++id, invoiceNumber, date, customerId, shiftId, status, syncStatus',
      salesItems: '++id, invoiceId, variantId',
      
      // Purchases
      purchaseInvoices: '++id, invoiceNumber, date, supplierId, status, syncStatus',
      purchaseItems: '++id, invoiceId, variantId',
      
      // Payments
      payments: '++id, date, direction, customerId, supplierId, refType, refId, shiftId, syncStatus',
      
      // Users & Shifts
      users: '++id, username, role, isActive',
      shifts: '++id, userId, openTime, status',
      
      // Audit & Settings
      auditLogs: '++id, userId, action, entity, timestamp',
      settings: '++id, key',
      
      // Returns
      returnInvoices: '++id, returnNumber, date, originalInvoiceId, customerId, syncStatus',
      returnItems: '++id, returnInvoiceId, variantId',
    });
  }
}

// Create and export database instance
export const db = new HoorDatabase();

// Utility functions
export async function getVariantStock(variantId: number): Promise<number> {
  const moves = await db.stockMoves.where('variantId').equals(variantId).toArray();
  return moves.reduce((stock, move) => stock + move.qtyIn - move.qtyOut, 0);
}

export async function getVariantWithStock(variantId: number) {
  const variant = await db.variants.get(variantId);
  if (!variant) return null;
  
  const stock = await getVariantStock(variantId);
  const model = await db.models.get(variant.modelId);
  const brand = model ? await db.brands.get(model.brandId) : null;
  
  return {
    ...variant,
    stock,
    model,
    brand,
  };
}

export async function searchVariants(query: string) {
  const lowerQuery = query.toLowerCase();
  
  // Search by barcode first (exact match)
  const byBarcode = await db.variants
    .where('barcode')
    .equals(query)
    .first();
  
  if (byBarcode) {
    return [await getVariantWithStock(byBarcode.id!)];
  }
  
  // Search by SKU
  const bySku = await db.variants
    .where('sku')
    .startsWithIgnoreCase(query)
    .toArray();
  
  if (bySku.length > 0) {
    return Promise.all(bySku.map(v => getVariantWithStock(v.id!)));
  }
  
  // Search by model name
  const models = await db.models.filter(m => {
    const nameMatch = m.name.toLowerCase().includes(lowerQuery);
    const nameArMatch = m.nameAr ? m.nameAr.includes(query) : false;
    return nameMatch || nameArMatch;
  }).toArray();
  
  if (models.length > 0) {
    const modelIds = models.map(m => m.id!);
    const variants = await db.variants
      .where('modelId')
      .anyOf(modelIds)
      .filter(v => v.isActive)
      .toArray();
    
    return Promise.all(variants.map(v => getVariantWithStock(v.id!)));
  }
  
  return [];
}

export async function generateInvoiceNumber(prefix: string): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  
  let count = 1;
  const setting = await db.settings.where('key').equals(`${prefix}_counter_${dateStr}`).first();
  
  if (setting) {
    count = parseInt(setting.value) + 1;
    await db.settings.update(setting.id!, { value: count.toString() });
  } else {
    await db.settings.add({
      key: `${prefix}_counter_${dateStr}`,
      value: '1',
      type: 'number',
    });
  }
  
  return `${prefix}-${dateStr}-${count.toString().padStart(4, '0')}`;
}

// Initialize default data
export async function initializeDatabase() {
  const brandsCount = await db.brands.count();
  
  if (brandsCount === 0) {
    // Add default warehouse
    await db.warehouses.add({
      name: 'المستودع الرئيسي',
      isDefault: true,
    });
    
    // Add default user
    await db.users.add({
      username: 'admin',
      name: 'مدير النظام',
      role: 'admin',
      isActive: true,
    });
    
    // Add default settings
    await db.settings.bulkAdd([
      { key: 'storeName', value: 'Hoor', type: 'string' },
      { key: 'currency', value: 'SAR', type: 'string' },
      { key: 'taxRate', value: '15', type: 'number' },
      { key: 'taxEnabled', value: 'true', type: 'boolean' },
    ]);
  }
}
