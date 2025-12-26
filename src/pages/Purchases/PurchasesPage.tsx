import { useState, useEffect } from 'react';
import { Plus, Search, Save, Trash2, FileText } from 'lucide-react';
import { Card, CardHeader, Button, Input, Modal, Select, Table, Badge } from '@/components/ui';
import { db, generateInvoiceNumber, getVariantStock } from '@/db';
import type { Supplier, Variant, Model, PurchaseInvoice, PurchaseItem } from '@/types';
import { useUIStore } from '@/stores';

interface CartItem {
  variant: Variant;
  model?: Model;
  qty: number;
  unitCost: number;
  lineTotal: number;
}

interface PurchaseWithItems extends PurchaseInvoice {
  supplier?: Supplier;
  items?: (PurchaseItem & { variant?: Variant; model?: Model })[];
}

export function PurchasesPage() {
  const { showToast } = useUIStore();
  
  // Data states
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseHistory, setPurchaseHistory] = useState<PurchaseWithItems[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<(Variant & { model?: Model; stock?: number })[]>([]);
  
  // Form states
  const [selectedSupplier, setSelectedSupplier] = useState<number | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState('');
  
  // Modals
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [supplierForm, setSupplierForm] = useState({ name: '', phone: '', address: '' });
  
  // Load data
  useEffect(() => {
    loadSuppliers();
    loadPurchaseHistory();
  }, []);
  
  // Search products
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.length >= 2) {
        const lowerQuery = searchQuery.toLowerCase();
        
        // Search by barcode
        const byBarcode = await db.variants.where('barcode').equals(searchQuery).first();
        if (byBarcode) {
          const model = await db.models.get(byBarcode.modelId);
          const stock = await getVariantStock(byBarcode.id!);
          setSearchResults([{ ...byBarcode, model, stock }]);
          return;
        }
        
        // Search by model name
        const models = await db.models.filter(m => 
          m.name.toLowerCase().includes(lowerQuery) || 
          Boolean(m.nameAr?.includes(searchQuery))
        ).toArray();
        
        if (models.length > 0) {
          const modelIds = models.map(m => m.id!);
          const variants = await db.variants
            .where('modelId')
            .anyOf(modelIds)
            .filter(v => v.isActive)
            .toArray();
          
          const results = await Promise.all(variants.map(async v => {
            const model = models.find(m => m.id === v.modelId);
            const stock = await getVariantStock(v.id!);
            return { ...v, model, stock };
          }));
          
          setSearchResults(results);
        } else {
          setSearchResults([]);
        }
      } else {
        setSearchResults([]);
      }
    }, 300);
    
    return () => clearTimeout(timer);
  }, [searchQuery]);
  
  const loadSuppliers = async () => {
    const data = await db.suppliers.toArray();
    setSuppliers(data);
  };
  
  const loadPurchaseHistory = async () => {
    const invoices = await db.purchaseInvoices.orderBy('date').reverse().limit(50).toArray();
    const withDetails = await Promise.all(invoices.map(async inv => {
      const supplier = inv.supplierId ? await db.suppliers.get(inv.supplierId) : undefined;
      return { ...inv, supplier };
    }));
    setPurchaseHistory(withDetails);
  };
  
  const saveSupplier = async () => {
    if (!supplierForm.name) {
      showToast('الرجاء إدخال اسم المورد', 'warning');
      return;
    }
    
    await db.suppliers.add({
      name: supplierForm.name,
      phone: supplierForm.phone,
      address: supplierForm.address,
      currentBalance: 0,
    });
    
    showToast('تمت إضافة المورد بنجاح', 'success');
    setShowSupplierModal(false);
    setSupplierForm({ name: '', phone: '', address: '' });
    loadSuppliers();
  };
  
  const addToCart = (variant: Variant & { model?: Model }) => {
    const existingIndex = cart.findIndex(item => item.variant.id === variant.id);
    
    if (existingIndex >= 0) {
      const newCart = [...cart];
      newCart[existingIndex].qty += 1;
      newCart[existingIndex].lineTotal = newCart[existingIndex].qty * newCart[existingIndex].unitCost;
      setCart(newCart);
    } else {
      setCart([...cart, {
        variant,
        model: variant.model,
        qty: 1,
        unitCost: variant.costPrice,
        lineTotal: variant.costPrice,
      }]);
    }
    
    setSearchQuery('');
    setSearchResults([]);
  };
  
  const updateCartItem = (index: number, field: 'qty' | 'unitCost', value: number) => {
    const newCart = [...cart];
    newCart[index][field] = value;
    newCart[index].lineTotal = newCart[index].qty * newCart[index].unitCost;
    setCart(newCart);
  };
  
  const removeFromCart = (index: number) => {
    setCart(cart.filter((_, i) => i !== index));
  };
  
  const subtotal = cart.reduce((sum, item) => sum + item.lineTotal, 0);
  const total = subtotal - discount;
  
  const savePurchase = async () => {
    if (!selectedSupplier) {
      showToast('الرجاء اختيار المورد', 'warning');
      return;
    }
    
    if (cart.length === 0) {
      showToast('الرجاء إضافة منتجات', 'warning');
      return;
    }
    
    try {
      const invoiceNumber = await generateInvoiceNumber('PUR');
      
      // Create purchase invoice
      const invoiceId = await db.purchaseInvoices.add({
        invoiceNumber,
        date: new Date(),
        supplierId: selectedSupplier,
        subtotal,
        discountAmount: discount,
        discountPercent: 0,
        total,
        paidAmount: 0,
        paymentStatus: 'unpaid',
        status: 'confirmed',
        notes,
      });
      
      // Add items and stock moves
      for (const item of cart) {
        await db.purchaseItems.add({
          invoiceId: invoiceId as number,
          variantId: item.variant.id!,
          qty: item.qty,
          unitCost: item.unitCost,
          lineTotal: item.lineTotal,
        });
        
        // Stock in
        await db.stockMoves.add({
          date: new Date(),
          variantId: item.variant.id!,
          qtyIn: item.qty,
          qtyOut: 0,
          unitCost: item.unitCost,
          refType: 'purchase',
          refId: invoiceId as number,
        });
        
        // Update variant cost price (weighted average)
        const currentStock = await getVariantStock(item.variant.id!);
        const totalCost = (item.variant.costPrice * (currentStock - item.qty)) + (item.unitCost * item.qty);
        const newCost = currentStock > 0 ? totalCost / currentStock : item.unitCost;
        
        await db.variants.update(item.variant.id!, {
          costPrice: newCost,
        });
      }
      
      // Update supplier balance
      const supplier = await db.suppliers.get(selectedSupplier);
      if (supplier) {
        await db.suppliers.update(selectedSupplier, {
          currentBalance: supplier.currentBalance + total,
        });
      }
      
      showToast(`تم حفظ فاتورة المشتريات رقم ${invoiceNumber}`, 'success');
      
      // Reset form
      setCart([]);
      setSelectedSupplier(null);
      setDiscount(0);
      setNotes('');
      loadPurchaseHistory();
      
    } catch (error) {
      console.error('Purchase error:', error);
      showToast('حدث خطأ أثناء حفظ الفاتورة', 'error');
    }
  };
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">
          المشتريات
        </h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowHistoryModal(true)}>
            <FileText size={18} className="ml-2" />
            سجل المشتريات
          </Button>
          <Button onClick={() => setShowSupplierModal(true)}>
            <Plus size={18} className="ml-2" />
            مورد جديد
          </Button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Purchase Form */}
        <div className="lg:col-span-2 space-y-4">
          {/* Supplier Selection */}
          <Card>
            <CardHeader title="معلومات الفاتورة" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label="المورد"
                placeholder="اختر المورد"
                options={suppliers.map(s => ({ value: s.id!, label: s.name }))}
                value={selectedSupplier || ''}
                onChange={(e) => setSelectedSupplier(Number(e.target.value) || null)}
              />
              <Input
                label="ملاحظات"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ملاحظات إضافية..."
              />
            </div>
          </Card>
          
          {/* Product Search */}
          <Card>
            <CardHeader title="إضافة منتجات" />
            <div className="relative">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث بالباركود أو اسم المنتج..."
                icon={<Search size={18} />}
              />
              
              {searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-lg border border-slate-200 max-h-60 overflow-y-auto z-10">
                  {searchResults.map((variant) => (
                    <button
                      key={variant.id}
                      onClick={() => addToCart(variant)}
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 border-b border-slate-100 last:border-0"
                    >
                      <div className="text-right">
                        <p className="font-medium text-slate-800">
                          {variant.model?.name} - {variant.color} - {variant.size}
                        </p>
                        <p className="text-sm text-slate-500">
                          {variant.sku} | المخزون: {variant.stock}
                        </p>
                      </div>
                      <p className="font-bold text-primary-600">{variant.costPrice.toFixed(2)} ر.س</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            {/* Cart Items */}
            <div className="mt-4 space-y-2">
              {cart.map((item, index) => (
                <div
                  key={item.variant.id}
                  className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg"
                >
                  <div className="flex-1">
                    <p className="font-medium text-slate-800">
                      {item.model?.name} - {item.variant.color} - {item.variant.size}
                    </p>
                    <p className="text-sm text-slate-500">{item.variant.sku}</p>
                  </div>
                  <Input
                    type="number"
                    value={item.qty}
                    onChange={(e) => updateCartItem(index, 'qty', Number(e.target.value))}
                    className="w-20 text-center"
                    min={1}
                  />
                  <Input
                    type="number"
                    value={item.unitCost}
                    onChange={(e) => updateCartItem(index, 'unitCost', Number(e.target.value))}
                    className="w-28 text-center"
                  />
                  <p className="w-24 text-left font-bold text-primary-600">
                    {item.lineTotal.toFixed(2)}
                  </p>
                  <Button variant="ghost" size="sm" onClick={() => removeFromCart(index)}>
                    <Trash2 size={18} className="text-red-500" />
                  </Button>
                </div>
              ))}
              
              {cart.length === 0 && (
                <p className="text-center text-slate-400 py-8">
                  ابحث عن منتجات لإضافتها للفاتورة
                </p>
              )}
            </div>
          </Card>
        </div>
        
        {/* Summary */}
        <div className="space-y-4">
          <Card>
            <CardHeader title="ملخص الفاتورة" />
            
            <div className="space-y-3">
              <div className="flex justify-between text-slate-600">
                <span>عدد الأصناف</span>
                <span>{cart.length}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>إجمالي الكميات</span>
                <span>{cart.reduce((sum, item) => sum + item.qty, 0)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>المجموع الفرعي</span>
                <span>{subtotal.toFixed(2)} ر.س</span>
              </div>
              
              <div className="flex gap-2 items-center">
                <span className="text-slate-600">الخصم</span>
                <Input
                  type="number"
                  value={discount}
                  onChange={(e) => setDiscount(Number(e.target.value))}
                  className="w-28 text-center"
                />
              </div>
              
              <div className="border-t border-slate-200 pt-3">
                <div className="flex justify-between text-xl font-bold text-slate-800">
                  <span>الإجمالي</span>
                  <span className="text-primary-600">{total.toFixed(2)} ر.س</span>
                </div>
              </div>
            </div>
            
            <Button
              className="w-full mt-6"
              size="lg"
              onClick={savePurchase}
              disabled={cart.length === 0 || !selectedSupplier}
            >
              <Save size={20} className="ml-2" />
              حفظ الفاتورة
            </Button>
          </Card>
        </div>
      </div>
      
      {/* Supplier Modal */}
      <Modal
        isOpen={showSupplierModal}
        onClose={() => setShowSupplierModal(false)}
        title="إضافة مورد جديد"
      >
        <div className="space-y-4">
          <Input
            label="اسم المورد"
            value={supplierForm.name}
            onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
          />
          <Input
            label="رقم الهاتف"
            value={supplierForm.phone}
            onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
          />
          <Input
            label="العنوان"
            value={supplierForm.address}
            onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}
          />
          <div className="flex gap-2 justify-end mt-6">
            <Button variant="secondary" onClick={() => setShowSupplierModal(false)}>
              إلغاء
            </Button>
            <Button onClick={saveSupplier}>
              حفظ
            </Button>
          </div>
        </div>
      </Modal>
      
      {/* History Modal */}
      <Modal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        title="سجل المشتريات"
        size="xl"
      >
        <Table
          columns={[
            { key: 'invoiceNumber', header: 'رقم الفاتورة' },
            { 
              key: 'date', 
              header: 'التاريخ',
              render: (item) => new Date(item.date).toLocaleDateString('ar-SA'),
            },
            { 
              key: 'supplier', 
              header: 'المورد',
              render: (item) => item.supplier?.name || '-',
            },
            { 
              key: 'total', 
              header: 'الإجمالي',
              render: (item) => `${item.total.toFixed(2)} ر.س`,
            },
            {
              key: 'paymentStatus',
              header: 'الحالة',
              render: (item) => (
                <Badge variant={item.paymentStatus === 'paid' ? 'success' : item.paymentStatus === 'partial' ? 'warning' : 'danger'}>
                  {item.paymentStatus === 'paid' ? 'مدفوع' : item.paymentStatus === 'partial' ? 'جزئي' : 'غير مدفوع'}
                </Badge>
              ),
            },
          ]}
          data={purchaseHistory}
          keyExtractor={(item) => item.id!}
          emptyMessage="لا توجد فواتير مشتريات"
        />
      </Modal>
    </div>
  );
}
