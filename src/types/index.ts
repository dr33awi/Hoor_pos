// ==================== Base Types ====================
export interface BaseEntity {
  id?: number;
  createdAt?: Date;
  updatedAt?: Date;
  syncStatus?: 'pending' | 'synced' | 'conflict';
}

// ==================== Products ====================
export interface Brand extends BaseEntity {
  name: string;
  nameAr?: string;
  isActive: boolean;
}

export interface Model extends BaseEntity {
  brandId: number;
  name: string;
  nameAr?: string;
  category: string;
  description?: string;
  image?: string;
  isActive: boolean;
}

export interface Variant extends BaseEntity {
  modelId: number;
  color: string;
  colorAr?: string;
  size: string;
  sku: string;
  barcode?: string;
  salePrice: number;
  costPrice: number;
  minStock?: number;
  isActive: boolean;
}

// ==================== Contacts ====================
export interface Customer extends BaseEntity {
  name: string;
  phone?: string;
  address?: string;
  creditLimit: number;
  currentBalance: number;
  notes?: string;
}

export interface Supplier extends BaseEntity {
  name: string;
  phone?: string;
  address?: string;
  currentBalance: number;
  notes?: string;
}

// ==================== Inventory ====================
export type StockMoveRefType = 
  | 'sale'
  | 'sale_return'
  | 'purchase'
  | 'purchase_return'
  | 'adjustment'
  | 'transfer'
  | 'opening';

export interface StockMove extends BaseEntity {
  date: Date;
  warehouseId?: number;
  variantId: number;
  qtyIn: number;
  qtyOut: number;
  unitCost: number;
  refType: StockMoveRefType;
  refId?: number;
  note?: string;
  createdBy?: number;
}

export interface Warehouse extends BaseEntity {
  name: string;
  isDefault: boolean;
}

// ==================== Sales ====================
export type PaymentStatus = 'paid' | 'unpaid' | 'partial';
export type InvoiceStatus = 'draft' | 'confirmed' | 'cancelled' | 'returned';

export interface SalesInvoice extends BaseEntity {
  invoiceNumber: string;
  date: Date;
  customerId?: number;
  shiftId?: number;
  subtotal: number;
  discountAmount: number;
  discountPercent: number;
  taxAmount: number;
  total: number;
  paidAmount: number;
  paymentStatus: PaymentStatus;
  status: InvoiceStatus;
  notes?: string;
  createdBy?: number;
}

export interface SalesItem extends BaseEntity {
  invoiceId: number;
  variantId: number;
  qty: number;
  price: number;
  discountAmount: number;
  discountPercent: number;
  lineTotal: number;
  unitCostSnapshot: number;
  returnedQty?: number;
}

// ==================== Purchases ====================
export interface PurchaseInvoice extends BaseEntity {
  invoiceNumber: string;
  date: Date;
  supplierId: number;
  subtotal: number;
  discountAmount: number;
  discountPercent: number;
  total: number;
  paidAmount: number;
  paymentStatus: PaymentStatus;
  status: InvoiceStatus;
  notes?: string;
  createdBy?: number;
}

export interface PurchaseItem extends BaseEntity {
  invoiceId: number;
  variantId: number;
  qty: number;
  unitCost: number;
  lineTotal: number;
}

// ==================== Payments ====================
export type PaymentDirection = 'in' | 'out';
export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'credit';
export type PaymentRefType = 
  | 'sale'
  | 'sale_return'
  | 'purchase'
  | 'purchase_return'
  | 'customer_payment'
  | 'supplier_payment'
  | 'expense'
  | 'income';

export interface Payment extends BaseEntity {
  date: Date;
  direction: PaymentDirection;
  method: PaymentMethod;
  amount: number;
  customerId?: number;
  supplierId?: number;
  refType: PaymentRefType;
  refId?: number;
  note?: string;
  shiftId?: number;
  createdBy?: number;
}

// ==================== Users & Shifts ====================
export type UserRole = 'admin' | 'manager' | 'cashier';

export interface User extends BaseEntity {
  username: string;
  password?: string;
  name: string;
  role: UserRole;
  isActive: boolean;
}

export interface Shift extends BaseEntity {
  userId: number;
  openTime: Date;
  closeTime?: Date;
  openingCash: number;
  closingCash?: number;
  expectedCash?: number;
  difference?: number;
  status: 'open' | 'closed';
  notes?: string;
}

// ==================== Audit ====================
export interface AuditLog extends BaseEntity {
  userId?: number;
  action: string;
  entity: string;
  entityId?: number;
  timestamp: Date;
  oldData?: string;
  newData?: string;
  meta?: string;
}

// ==================== Settings ====================
export interface Setting extends BaseEntity {
  key: string;
  value: string;
  type: 'string' | 'number' | 'boolean' | 'json';
}

// ==================== Returns ====================
export interface ReturnInvoice extends BaseEntity {
  returnNumber: string;
  date: Date;
  originalInvoiceId: number;
  customerId?: number;
  type: 'return' | 'exchange';
  returnTotal: number;
  exchangeTotal: number;
  difference: number;
  status: 'pending' | 'completed';
  notes?: string;
  createdBy?: number;
}

export interface ReturnItem extends BaseEntity {
  returnInvoiceId: number;
  originalItemId: number;
  variantId: number;
  qty: number;
  price: number;
  lineTotal: number;
}

// ==================== Cart (POS) ====================
export interface CartItem {
  variantId: number;
  variant?: Variant;
  model?: Model;
  qty: number;
  price: number;
  discountAmount: number;
  discountPercent: number;
  lineTotal: number;
}

export interface Cart {
  items: CartItem[];
  customerId?: number;
  customer?: Customer;
  subtotal: number;
  discountAmount: number;
  discountPercent: number;
  taxAmount: number;
  total: number;
}

// ==================== Hold Invoices ====================
export interface HoldInvoice {
  id: string;
  cart: Cart;
  holdTime: Date;
  note?: string;
}
