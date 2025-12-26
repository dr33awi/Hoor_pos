import { useState, useRef, useEffect } from 'react';
import { Search, Trash2, Plus, Minus, Pause, Play, CreditCard, Banknote, Smartphone } from 'lucide-react';
import { Card, Button, Input, Modal } from '@/components/ui';
import { usePOSStore, useUIStore } from '@/stores';
import { searchVariants } from '@/db';
import type { Variant, Model } from '@/types';

interface SearchResult {
  variant: Variant;
  model: Model | null;
  stock: number;
}

export function POSPage() {
  const {
    cart,
    holdInvoices,
    addToCart,
    updateCartItem,
    removeFromCart,
    clearCart,
    holdCart,
    recallHold,
    checkout,
  } = usePOSStore();
  
  const { showToast } = useUIStore();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showHoldModal, setShowHoldModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'transfer'>('cash');
  const [paidAmount, setPaidAmount] = useState('');
  const [holdNote, setHoldNote] = useState('');
  
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Search products
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.length >= 2) {
        const results = await searchVariants(searchQuery);
        const mappedResults: SearchResult[] = results
          .filter(r => r !== null)
          .map(r => ({
            variant: r as Variant,
            model: (r as { model?: Model }).model || null,
            stock: (r as { stock?: number }).stock || 0
          }));
        setSearchResults(mappedResults);
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleAddToCart = (result: SearchResult) => {
    if (result.stock <= 0) {
      showToast('المنتج غير متوفر في المخزون', 'warning');
      return;
    }
    
    addToCart(result.variant, result.model!);
    setSearchQuery('');
    setSearchResults([]);
    searchInputRef.current?.focus();
    showToast('تمت الإضافة للسلة', 'success');
  };

  const handleCheckout = async () => {
    if (cart.items.length === 0) {
      showToast('السلة فارغة', 'warning');
      return;
    }

    const paid = parseFloat(paidAmount) || cart.total;
    const invoiceId = await checkout(paymentMethod, paid);
    
    if (invoiceId) {
      showToast(`تم إنشاء الفاتورة رقم ${invoiceId}`, 'success');
      setShowPaymentModal(false);
      setPaidAmount('');
    } else {
      showToast('حدث خطأ أثناء إنشاء الفاتورة', 'error');
    }
  };

  const handleHold = () => {
    holdCart(holdNote);
    setShowHoldModal(false);
    setHoldNote('');
    showToast('تم تعليق الفاتورة', 'info');
  };

  const change = parseFloat(paidAmount) - cart.total;

  return (
    <div className="flex gap-6 h-[calc(100vh-8rem)]">
      {/* Products Section */}
      <div className="flex-1 flex flex-col">
        {/* Search */}
        <Card className="mb-4">
          <div className="relative">
            <Input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث بالباركود أو اسم المنتج..."
              icon={<Search size={20} />}
              className="text-lg"
            />
            
            {/* Search Results Dropdown */}
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-lg border border-slate-200 max-h-80 overflow-y-auto z-10">
                {searchResults.map((result) => (
                  <button
                    key={result.variant.id}
                    onClick={() => handleAddToCart(result)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 border-b border-slate-100 last:border-0"
                  >
                    <div className="text-right">
                      <p className="font-medium text-slate-800">
                        {result.model?.name} - {result.variant.color} - {result.variant.size}
                      </p>
                      <p className="text-sm text-slate-500">
                        {result.variant.sku} | المخزون: {result.stock}
                      </p>
                    </div>
                    <div className="text-left">
                      <p className="font-bold text-primary-600">
                        {result.variant.salePrice.toFixed(2)} ر.س
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Quick Actions */}
        <Card className="mb-4">
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="secondary"
              onClick={() => setShowHoldModal(true)}
              disabled={cart.items.length === 0}
            >
              <Pause size={18} className="ml-2" />
              تعليق
            </Button>
            
            {holdInvoices.length > 0 && (
              <Button
                variant="ghost"
                onClick={() => recallHold(holdInvoices[holdInvoices.length - 1].id)}
              >
                <Play size={18} className="ml-2" />
                استرجاع ({holdInvoices.length})
              </Button>
            )}
            
            <Button
              variant="danger"
              onClick={clearCart}
              disabled={cart.items.length === 0}
            >
              <Trash2 size={18} className="ml-2" />
              مسح السلة
            </Button>
          </div>
        </Card>

        {/* Products Grid - Placeholder for quick select */}
        <Card className="flex-1 overflow-y-auto">
          <p className="text-center text-slate-500 py-8">
            استخدم البحث لإضافة منتجات للسلة
          </p>
        </Card>
      </div>

      {/* Cart Section */}
      <div className="w-96 flex flex-col">
        <Card padding="none" className="flex-1 flex flex-col">
          {/* Cart Header */}
          <div className="p-4 border-b border-slate-200">
            <h2 className="text-lg font-bold text-slate-800">
              سلة المشتريات
            </h2>
            {cart.customer && (
              <p className="text-sm text-primary-600">
                العميل: {cart.customer.name}
              </p>
            )}
          </div>

          {/* Cart Items */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {cart.items.length === 0 ? (
              <p className="text-center text-slate-400 py-8">
                السلة فارغة
              </p>
            ) : (
              cart.items.map((item) => (
                <div
                  key={item.variantId}
                  className="bg-slate-50 rounded-lg p-3"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-medium text-slate-800">
                        {item.model?.name}
                      </p>
                      <p className="text-sm text-slate-500">
                        {item.variant?.color} - {item.variant?.size}
                      </p>
                    </div>
                    <button
                      onClick={() => removeFromCart(item.variantId)}
                      className="text-red-500 hover:text-red-700 p-1"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateCartItem(item.variantId, { qty: Math.max(1, item.qty - 1) })}
                        className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-8 text-center font-medium">{item.qty}</span>
                      <button
                        onClick={() => updateCartItem(item.variantId, { qty: item.qty + 1 })}
                        className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <p className="font-bold text-primary-600">
                      {item.lineTotal.toFixed(2)} ر.س
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Cart Summary */}
          <div className="p-4 border-t border-slate-200 space-y-2">
            <div className="flex justify-between text-slate-600">
              <span>المجموع الفرعي</span>
              <span>{cart.subtotal.toFixed(2)} ر.س</span>
            </div>
            
            {cart.discountAmount > 0 && (
              <div className="flex justify-between text-red-500">
                <span>الخصم</span>
                <span>-{cart.discountAmount.toFixed(2)} ر.س</span>
              </div>
            )}
            
            <div className="flex justify-between text-xl font-bold text-slate-800 pt-2 border-t border-slate-200">
              <span>الإجمالي</span>
              <span className="text-primary-600">{cart.total.toFixed(2)} ر.س</span>
            </div>
          </div>

          {/* Checkout Button */}
          <div className="p-4 border-t border-slate-200">
            <Button
              size="lg"
              className="w-full"
              onClick={() => setShowPaymentModal(true)}
              disabled={cart.items.length === 0}
            >
              <CreditCard size={20} className="ml-2" />
              الدفع
            </Button>
          </div>
        </Card>
      </div>

      {/* Payment Modal */}
      <Modal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        title="تحديد طريقة الدفع"
        size="md"
      >
        <div className="space-y-6">
          {/* Total */}
          <div className="text-center p-4 bg-primary-100 rounded-lg">
            <p className="text-sm text-slate-600">المبلغ المطلوب</p>
            <p className="text-3xl font-bold text-primary-600">{cart.total.toFixed(2)} ر.س</p>
          </div>

          {/* Payment Methods */}
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setPaymentMethod('cash')}
              className={`p-4 rounded-lg border-2 transition-all duration-200 ${
                paymentMethod === 'cash'
                  ? 'border-primary-500 bg-primary-100'
                  : 'border-slate-200 hover:border-primary-300'
              }`}
            >
              <Banknote size={24} className="mx-auto mb-2" />
              <span className="text-sm">نقدي</span>
            </button>
            
            <button
              onClick={() => setPaymentMethod('card')}
              className={`p-4 rounded-lg border-2 transition-all duration-200 ${
                paymentMethod === 'card'
                  ? 'border-primary-500 bg-primary-100'
                  : 'border-slate-200 hover:border-primary-300'
              }`}
            >
              <CreditCard size={24} className="mx-auto mb-2" />
              <span className="text-sm">بطاقة</span>
            </button>
            
            <button
              onClick={() => setPaymentMethod('transfer')}
              className={`p-4 rounded-lg border-2 transition-all duration-200 ${
                paymentMethod === 'transfer'
                  ? 'border-primary-500 bg-primary-100'
                  : 'border-slate-200 hover:border-primary-300'
              }`}
            >
              <Smartphone size={24} className="mx-auto mb-2" />
              <span className="text-sm">تحويل</span>
            </button>
          </div>

          {/* Paid Amount */}
          {paymentMethod === 'cash' && (
            <div>
              <Input
                label="المبلغ المدفوع"
                type="number"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                placeholder={cart.total.toFixed(2)}
              />
              
              {change > 0 && (
                <div className="mt-2 p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-slate-600">الباقي</p>
                  <p className="text-xl font-bold text-blue-600">{change.toFixed(2)} ر.س</p>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setShowPaymentModal(false)}
            >
              إلغاء
            </Button>
            <Button
              className="flex-1"
              onClick={handleCheckout}
            >
              تأكيد الدفع
            </Button>
          </div>
        </div>
      </Modal>

      {/* Hold Modal */}
      <Modal
        isOpen={showHoldModal}
        onClose={() => setShowHoldModal(false)}
        title="تعليق الفاتورة"
        size="sm"
      >
        <div className="space-y-4">
          <Input
            label="ملاحظة (اختياري)"
            value={holdNote}
            onChange={(e) => setHoldNote(e.target.value)}
            placeholder="مثال: اسم العميل"
          />
          
          <div className="flex gap-3">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setShowHoldModal(false)}
            >
              إلغاء
            </Button>
            <Button
              className="flex-1"
              onClick={handleHold}
            >
              <Pause size={18} className="ml-2" />
              تعليق
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
