import { useState, useEffect } from 'react';
import { Search, RotateCcw, ArrowLeftRight, Save, FileText } from 'lucide-react';
import { Card, CardHeader, Button, Input, Modal, Table, Badge } from '@/components/ui';
import { db, generateInvoiceNumber, getVariantStock } from '@/db';
import type { SalesInvoice, SalesItem, Variant, Model, ReturnInvoice, Customer } from '@/types';
import { useUIStore } from '@/stores';

interface InvoiceWithItems extends SalesInvoice {
  items: (SalesItem & { variant?: Variant; model?: Model })[];
  customer?: Customer;
}

interface ReturnItem {
  originalItem: SalesItem;
  variant: Variant;
  model?: Model;
  returnQty: number;
  maxQty: number;
}

interface ExchangeItem {
  variant: Variant;
  model?: Model;
  qty: number;
  price: number;
  lineTotal: number;
}

export function ReturnsPage() {
  const { showToast } = useUIStore();
  
  // States
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [originalInvoice, setOriginalInvoice] = useState<InvoiceWithItems | null>(null);
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);
  const [exchangeItems, setExchangeItems] = useState<ExchangeItem[]>([]);
  const [isExchange, setIsExchange] = useState(false);
  const [returnHistory, setReturnHistory] = useState<(ReturnInvoice & { originalInvoice?: SalesInvoice })[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  
  // Exchange search
  const [exchangeSearch, setExchangeSearch] = useState('');
  const [exchangeResults, setExchangeResults] = useState<(Variant & { model?: Model; stock?: number })[]>([]);
  
  useEffect(() => {
    loadReturnHistory();
  }, []);
  
  // Search for exchange products
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (exchangeSearch.length >= 2) {
        const lowerQuery = exchangeSearch.toLowerCase();
        
        const byBarcode = await db.variants.where('barcode').equals(exchangeSearch).first();
        if (byBarcode) {
          const model = await db.models.get(byBarcode.modelId);
          const stock = await getVariantStock(byBarcode.id!);
          setExchangeResults([{ ...byBarcode, model, stock }]);
          return;
        }
        
        const models = await db.models.filter(m =>
          m.name.toLowerCase().includes(lowerQuery) ||
          Boolean(m.nameAr?.includes(exchangeSearch))
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
          
          setExchangeResults(results);
        } else {
          setExchangeResults([]);
        }
      } else {
        setExchangeResults([]);
      }
    }, 300);
    
    return () => clearTimeout(timer);
  }, [exchangeSearch]);
  
  const loadReturnHistory = async () => {
    const returns = await db.returnInvoices.orderBy('date').reverse().limit(50).toArray();
    const withDetails = await Promise.all(returns.map(async ret => {
      const originalInvoice = await db.salesInvoices.get(ret.originalInvoiceId);
      return { ...ret, originalInvoice };
    }));
    setReturnHistory(withDetails);
  };
  
  const searchInvoice = async () => {
    if (!invoiceNumber) {
      showToast('الرجاء إدخال رقم الفاتورة', 'warning');
      return;
    }
    
    const invoice = await db.salesInvoices
      .where('invoiceNumber')
      .equals(invoiceNumber)
      .first();
    
    if (!invoice) {
      showToast('الفاتورة غير موجودة', 'error');
      return;
    }
    
    if (invoice.status === 'returned') {
      showToast('هذه الفاتورة تم إرجاعها بالكامل مسبقاً', 'warning');
      return;
    }
    
    // Load invoice items
    const items = await db.salesItems.where('invoiceId').equals(invoice.id!).toArray();
    const itemsWithDetails = await Promise.all(items.map(async item => {
      const variant = await db.variants.get(item.variantId);
      const model = variant ? await db.models.get(variant.modelId) : undefined;
      return { ...item, variant, model };
    }));
    
    const customer = invoice.customerId ? await db.customers.get(invoice.customerId) : undefined;
    
    setOriginalInvoice({ ...invoice, items: itemsWithDetails, customer });
    
    // Initialize return items
    setReturnItems(itemsWithDetails.map(item => ({
      originalItem: item,
      variant: item.variant!,
      model: item.model,
      returnQty: 0,
      maxQty: item.qty - (item.returnedQty || 0),
    })));
    
    setExchangeItems([]);
  };
  
  const updateReturnQty = (index: number, qty: number) => {
    const newItems = [...returnItems];
    newItems[index].returnQty = Math.min(qty, newItems[index].maxQty);
    setReturnItems(newItems);
  };
  
  const addExchangeItem = (variant: Variant & { model?: Model; stock?: number }) => {
    if ((variant.stock || 0) <= 0) {
      showToast('المنتج غير متوفر في المخزون', 'warning');
      return;
    }
    
    const existingIndex = exchangeItems.findIndex(item => item.variant.id === variant.id);
    
    if (existingIndex >= 0) {
      const newItems = [...exchangeItems];
      newItems[existingIndex].qty += 1;
      newItems[existingIndex].lineTotal = newItems[existingIndex].qty * newItems[existingIndex].price;
      setExchangeItems(newItems);
    } else {
      setExchangeItems([...exchangeItems, {
        variant,
        model: variant.model,
        qty: 1,
        price: variant.salePrice,
        lineTotal: variant.salePrice,
      }]);
    }
    
    setExchangeSearch('');
    setExchangeResults([]);
  };
  
  const removeExchangeItem = (index: number) => {
    setExchangeItems(exchangeItems.filter((_, i) => i !== index));
  };
  
  // Calculate totals
  const returnTotal = returnItems.reduce(
    (sum, item) => sum + (item.returnQty * item.originalItem.price),
    0
  );
  const exchangeTotal = exchangeItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const difference = exchangeTotal - returnTotal;
  
  const processReturn = async () => {
    const itemsToReturn = returnItems.filter(item => item.returnQty > 0);
    
    if (itemsToReturn.length === 0) {
      showToast('الرجاء تحديد كميات للإرجاع', 'warning');
      return;
    }
    
    try {
      const returnNumber = await generateInvoiceNumber('RET');
      
      // Create return invoice
      const returnInvoiceId = await db.returnInvoices.add({
        returnNumber,
        date: new Date(),
        originalInvoiceId: originalInvoice!.id!,
        customerId: originalInvoice!.customerId,
        type: isExchange ? 'exchange' : 'return',
        returnTotal,
        exchangeTotal: isExchange ? exchangeTotal : 0,
        difference: isExchange ? difference : -returnTotal,
        status: 'completed',
      });
      
      // Process return items - stock in
      for (const item of itemsToReturn) {
        await db.returnItems.add({
          returnInvoiceId: returnInvoiceId as number,
          originalItemId: item.originalItem.id!,
          variantId: item.variant.id!,
          qty: item.returnQty,
          price: item.originalItem.price,
          lineTotal: item.returnQty * item.originalItem.price,
        });
        
        // Stock back in
        await db.stockMoves.add({
          date: new Date(),
          variantId: item.variant.id!,
          qtyIn: item.returnQty,
          qtyOut: 0,
          unitCost: item.originalItem.unitCostSnapshot,
          refType: 'sale_return',
          refId: returnInvoiceId as number,
        });
        
        // Update returned qty on original item
        await db.salesItems.update(item.originalItem.id!, {
          returnedQty: (item.originalItem.returnedQty || 0) + item.returnQty,
        });
      }
      
      // Process exchange items - stock out
      if (isExchange && exchangeItems.length > 0) {
        const exchangeInvoiceNumber = await generateInvoiceNumber('EXC');
        
        const exchangeInvoiceId = await db.salesInvoices.add({
          invoiceNumber: exchangeInvoiceNumber,
          date: new Date(),
          customerId: originalInvoice!.customerId,
          subtotal: exchangeTotal,
          discountAmount: 0,
          discountPercent: 0,
          taxAmount: 0,
          total: exchangeTotal,
          paidAmount: Math.max(0, difference),
          paymentStatus: difference <= 0 ? 'paid' : 'unpaid',
          status: 'confirmed',
          notes: `استبدال من فاتورة ${originalInvoice!.invoiceNumber}`,
        });
        
        for (const item of exchangeItems) {
          await db.salesItems.add({
            invoiceId: exchangeInvoiceId as number,
            variantId: item.variant.id!,
            qty: item.qty,
            price: item.price,
            discountAmount: 0,
            discountPercent: 0,
            lineTotal: item.lineTotal,
            unitCostSnapshot: item.variant.costPrice,
          });
          
          await db.stockMoves.add({
            date: new Date(),
            variantId: item.variant.id!,
            qtyIn: 0,
            qtyOut: item.qty,
            unitCost: item.variant.costPrice,
            refType: 'sale',
            refId: exchangeInvoiceId as number,
          });
        }
      }
      
      // Handle payment/refund
      if (difference !== 0) {
        await db.payments.add({
          date: new Date(),
          direction: difference > 0 ? 'in' : 'out',
          method: 'cash',
          amount: Math.abs(difference),
          customerId: originalInvoice!.customerId,
          refType: isExchange ? 'sale' : 'sale_return',
          refId: returnInvoiceId as number,
        });
      }
      
      // Update customer balance if applicable
      if (originalInvoice!.customerId) {
        const customer = await db.customers.get(originalInvoice!.customerId);
        if (customer) {
          const balanceChange = isExchange ? difference : -returnTotal;
          await db.customers.update(originalInvoice!.customerId, {
            currentBalance: customer.currentBalance + balanceChange,
          });
        }
      }
      
      // Check if all items returned
      const allItemsReturned = returnItems.every(item => 
        item.returnQty >= item.maxQty
      );
      
      if (allItemsReturned) {
        await db.salesInvoices.update(originalInvoice!.id!, {
          status: 'returned',
        });
      }
      
      showToast(
        isExchange 
          ? `تم الاستبدال بنجاح. ${difference > 0 ? `الفرق المطلوب: ${difference.toFixed(2)} ر.س` : difference < 0 ? `المبلغ المسترد: ${Math.abs(difference).toFixed(2)} ر.س` : 'لا يوجد فرق'}`
          : `تم الإرجاع بنجاح. المبلغ المسترد: ${returnTotal.toFixed(2)} ر.س`,
        'success'
      );
      
      // Reset
      setOriginalInvoice(null);
      setReturnItems([]);
      setExchangeItems([]);
      setInvoiceNumber('');
      setIsExchange(false);
      loadReturnHistory();
      
    } catch (error) {
      console.error('Return error:', error);
      showToast('حدث خطأ أثناء معالجة العملية', 'error');
    }
  };
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">
          المرتجعات والاستبدال
        </h1>
        <Button variant="secondary" onClick={() => setShowHistoryModal(true)}>
          <FileText size={18} className="ml-2" />
          سجل المرتجعات
        </Button>
      </div>
      
      {/* Invoice Search */}
      <Card>
        <CardHeader title="البحث عن الفاتورة الأصلية" />
        <div className="flex gap-4">
          <Input
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            placeholder="أدخل رقم الفاتورة..."
            icon={<Search size={18} />}
            className="flex-1"
          />
          <Button onClick={searchInvoice}>
            <Search size={18} className="ml-2" />
            بحث
          </Button>
        </div>
      </Card>
      
      {/* Original Invoice Details */}
      {originalInvoice && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {/* Invoice Info */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-slate-800">
                    فاتورة رقم: {originalInvoice.invoiceNumber}
                  </h3>
                  <p className="text-sm text-slate-500">
                    {new Date(originalInvoice.date).toLocaleDateString('ar-SA')} | 
                    {originalInvoice.customer ? ` العميل: ${originalInvoice.customer.name}` : ' عميل نقدي'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant={!isExchange ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setIsExchange(false)}
                  >
                    <RotateCcw size={16} className="ml-1" />
                    مرتجع فقط
                  </Button>
                  <Button
                    variant={isExchange ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setIsExchange(true)}
                  >
                    <ArrowLeftRight size={16} className="ml-1" />
                    استبدال
                  </Button>
                </div>
              </div>
              
              {/* Return Items */}
              <h4 className="font-medium text-slate-700 mb-3">
                اختر الأصناف للإرجاع:
              </h4>
              <div className="space-y-2">
                {returnItems.map((item, index) => (
                  <div
                    key={item.originalItem.id}
                    className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-slate-800">
                        {item.model?.name} - {item.variant.color} - {item.variant.size}
                      </p>
                      <p className="text-sm text-slate-500">
                        السعر: {item.originalItem.price.toFixed(2)} | 
                        الكمية الأصلية: {item.originalItem.qty} | 
                        المتاح للإرجاع: {item.maxQty}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-500">كمية الإرجاع:</span>
                      <Input
                        type="number"
                        value={item.returnQty}
                        onChange={(e) => updateReturnQty(index, Number(e.target.value))}
                        className="w-20 text-center"
                        min={0}
                        max={item.maxQty}
                      />
                    </div>
                    <p className="w-24 text-left font-bold text-red-600">
                      {(item.returnQty * item.originalItem.price).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
            
            {/* Exchange Items */}
            {isExchange && (
              <Card>
                <CardHeader title="أصناف الاستبدال (البديلة)" />
                <div className="relative mb-4">
                  <Input
                    value={exchangeSearch}
                    onChange={(e) => setExchangeSearch(e.target.value)}
                    placeholder="ابحث عن منتج للاستبدال..."
                    icon={<Search size={18} />}
                  />
                  
                  {exchangeResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-lg border border-slate-200 max-h-60 overflow-y-auto z-10">
                      {exchangeResults.map((variant) => (
                        <button
                          key={variant.id}
                          onClick={() => addExchangeItem(variant)}
                          className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 border-b border-slate-100 last:border-0"
                        >
                          <div className="text-right">
                            <p className="font-medium text-slate-800">
                              {variant.model?.name} - {variant.color} - {variant.size}
                            </p>
                            <p className="text-sm text-slate-500">
                              المخزون: {variant.stock}
                            </p>
                          </div>
                          <p className="font-bold text-primary-600">{variant.salePrice.toFixed(2)} ر.س</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="space-y-2">
                  {exchangeItems.map((item, index) => (
                    <div
                      key={item.variant.id}
                      className="flex items-center gap-4 p-3 bg-primary-100 rounded-lg"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-slate-800">
                          {item.model?.name} - {item.variant.color} - {item.variant.size}
                        </p>
                        <p className="text-sm text-slate-500">
                          السعر: {item.price.toFixed(2)} ر.س
                        </p>
                      </div>
                      <Input
                        type="number"
                        value={item.qty}
                        onChange={(e) => {
                          const newItems = [...exchangeItems];
                          newItems[index].qty = Number(e.target.value);
                          newItems[index].lineTotal = newItems[index].qty * newItems[index].price;
                          setExchangeItems(newItems);
                        }}
                        className="w-20 text-center"
                        min={1}
                      />
                      <p className="w-24 text-left font-bold text-primary-600">
                        {item.lineTotal.toFixed(2)}
                      </p>
                      <Button variant="ghost" size="sm" onClick={() => removeExchangeItem(index)}>
                        ✕
                      </Button>
                    </div>
                  ))}
                  
                  {exchangeItems.length === 0 && (
                    <p className="text-center text-slate-400 py-4">
                      ابحث عن منتجات للاستبدال
                    </p>
                  )}
                </div>
              </Card>
            )}
          </div>
          
          {/* Summary */}
          <Card>
            <CardHeader title="ملخص العملية" />
            
            <div className="space-y-3">
              <div className="flex justify-between text-slate-600">
                <span>قيمة المرتجعات</span>
                <span className="text-red-600">-{returnTotal.toFixed(2)} ر.س</span>
              </div>
              
              {isExchange && (
                <div className="flex justify-between text-slate-600">
                  <span>قيمة البدائل</span>
                  <span className="text-green-600">+{exchangeTotal.toFixed(2)} ر.س</span>
                </div>
              )}
              
              <div className="border-t border-slate-200 pt-3">
                <div className="flex justify-between text-xl font-bold text-slate-800">
                  <span>{difference > 0 ? 'المطلوب من العميل' : 'المستحق للعميل'}</span>
                  <span className={difference > 0 ? 'text-green-600' : 'text-red-600'}>
                    {Math.abs(isExchange ? difference : returnTotal).toFixed(2)} ر.س
                  </span>
                </div>
              </div>
            </div>
            
            <Button
              className="w-full mt-6"
              size="lg"
              onClick={processReturn}
              disabled={returnItems.every(item => item.returnQty === 0)}
            >
              <Save size={20} className="ml-2" />
              {isExchange ? 'تأكيد الاستبدال' : 'تأكيد الإرجاع'}
            </Button>
          </Card>
        </div>
      )}
      
      {/* History Modal */}
      <Modal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        title="سجل المرتجعات"
        size="xl"
      >
        <Table
          columns={[
            { key: 'returnNumber', header: 'رقم المرتجع' },
            {
              key: 'date',
              header: 'التاريخ',
              render: (item) => new Date(item.date).toLocaleDateString('ar-SA'),
            },
            {
              key: 'originalInvoice',
              header: 'الفاتورة الأصلية',
              render: (item) => item.originalInvoice?.invoiceNumber || '-',
            },
            {
              key: 'type',
              header: 'النوع',
              render: (item) => (
                <Badge variant={item.type === 'exchange' ? 'info' : 'warning'}>
                  {item.type === 'exchange' ? 'استبدال' : 'مرتجع'}
                </Badge>
              ),
            },
            {
              key: 'returnTotal',
              header: 'قيمة المرتجع',
              render: (item) => `${item.returnTotal.toFixed(2)} ر.س`,
            },
            {
              key: 'difference',
              header: 'الفرق',
              render: (item) => (
                <span className={item.difference > 0 ? 'text-green-600' : 'text-red-600'}>
                  {item.difference.toFixed(2)} ر.س
                </span>
              ),
            },
          ]}
          data={returnHistory}
          keyExtractor={(item) => item.id!}
          emptyMessage="لا توجد مرتجعات"
        />
      </Modal>
    </div>
  );
}
