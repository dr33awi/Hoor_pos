import { useState, useEffect } from 'react';
import {
  Play,
  Square,
  Plus,
  Minus,
  FileText,
  Clock,
  DollarSign,
  ArrowUpCircle,
  ArrowDownCircle,
  Wallet,
} from 'lucide-react';
import { Card, Button, Input, Modal, Table, Badge, StatCard, Tabs, Select } from '@/components/ui';
import { db } from '@/db';
import type { Shift, User } from '@/types';
import { useUIStore } from '@/stores';

interface ShiftWithDetails extends Shift {
  user?: User;
  salesTotal?: number;
  paymentsIn?: number;
  paymentsOut?: number;
}

interface CashMovement {
  date: Date;
  type: 'sale' | 'payment_in' | 'payment_out' | 'expense' | 'income';
  description: string;
  amount: number;
  balance: number;
}

export function CashboxPage() {
  const { showToast } = useUIStore();
  
  // States
  const [currentShift, setCurrentShift] = useState<ShiftWithDetails | null>(null);
  const [shiftHistory, setShiftHistory] = useState<ShiftWithDetails[]>([]);
  const [todayMovements, setTodayMovements] = useState<CashMovement[]>([]);
  // Modals
  const [showOpenShiftModal, setShowOpenShiftModal] = useState(false);
  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  
  // Forms
  const [openingCash, setOpeningCash] = useState('');
  const [closingCash, setClosingCash] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  
  const [paymentType, setPaymentType] = useState<'in' | 'out'>('in');
  const [paymentCategory, setPaymentCategory] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  
  useEffect(() => {
    loadCurrentShift();
    loadShiftHistory();
  }, []);
  
  useEffect(() => {
    if (currentShift) {
      loadTodayMovements();
    }
  }, [currentShift]);
  
  const loadCurrentShift = async () => {
    const openShift = await db.shifts.where('status').equals('open').first();
    
    if (openShift) {
      const user = await db.users.get(openShift.userId);
      
      // Calculate shift stats
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const salesInvoices = await db.salesInvoices
        .where('date')
        .above(today)
        .toArray();
      
      const payments = await db.payments
        .where('date')
        .above(today)
        .toArray();
      
      setCurrentShift({
        ...openShift,
        user,
        salesTotal: salesInvoices.reduce((sum, inv) => sum + inv.paidAmount, 0),
        paymentsIn: payments.filter(p => p.direction === 'in').reduce((sum, p) => sum + p.amount, 0),
        paymentsOut: payments.filter(p => p.direction === 'out').reduce((sum, p) => sum + p.amount, 0),
      });
    } else {
      setCurrentShift(null);
    }
  };
  
  const loadShiftHistory = async () => {
    const shifts = await db.shifts.orderBy('openTime').reverse().limit(30).toArray();
    
    const withDetails = await Promise.all(shifts.map(async shift => {
      const user = await db.users.get(shift.userId);
      return { ...shift, user };
    }));
    
    setShiftHistory(withDetails);
  };
  
  const loadTodayMovements = async () => {
    if (!currentShift) return;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const payments = await db.payments
      .where('date')
      .above(today)
      .toArray();
    
    const movements: CashMovement[] = [];
    
    // Add opening cash
    movements.push({
      date: currentShift.openTime,
      type: 'income',
      description: 'رصيد افتتاحي',
      amount: currentShift.openingCash,
      balance: currentShift.openingCash,
    });
    
    // Add payments
    let balance = currentShift.openingCash;
    
    payments.forEach(payment => {
      const amount = payment.direction === 'in' ? payment.amount : -payment.amount;
      balance += amount;
      
      let description = payment.note || '';
      if (payment.refType === 'sale') description = 'مبيعات';
      else if (payment.refType === 'sale_return') description = 'مرتجع مبيعات';
      else if (payment.refType === 'customer_payment') description = 'تحصيل من عميل';
      else if (payment.refType === 'supplier_payment') description = 'دفعة لمورد';
      else if (payment.refType === 'expense') description = 'مصروف';
      else if (payment.refType === 'income') description = 'إيراد';
      
      movements.push({
        date: payment.date,
        type: payment.direction === 'in' ? 'payment_in' : 'payment_out',
        description,
        amount: payment.amount,
        balance,
      });
    });
    
    setTodayMovements(movements);
  };
  
  const openShift = async () => {
    if (!openingCash) {
      showToast('الرجاء إدخال الرصيد الافتتاحي', 'warning');
      return;
    }
    
    // Get default user (in real app, this would be the logged-in user)
    const user = await db.users.where('role').equals('admin').first();
    
    await db.shifts.add({
      userId: user?.id || 1,
      openTime: new Date(),
      openingCash: parseFloat(openingCash),
      status: 'open',
    });
    
    showToast('تم فتح الوردية بنجاح', 'success');
    setShowOpenShiftModal(false);
    setOpeningCash('');
    loadCurrentShift();
    loadShiftHistory();
  };
  
  const closeShift = async () => {
    if (!closingCash || !currentShift) {
      showToast('الرجاء إدخال الرصيد الفعلي', 'warning');
      return;
    }
    
    const closing = parseFloat(closingCash);
    const expected = currentShift.openingCash + 
      (currentShift.paymentsIn || 0) - 
      (currentShift.paymentsOut || 0);
    const difference = closing - expected;
    
    await db.shifts.update(currentShift.id!, {
      closeTime: new Date(),
      closingCash: closing,
      expectedCash: expected,
      difference,
      status: 'closed',
      notes: closeNotes,
    });
    
    showToast(
      `تم إغلاق الوردية. ${difference !== 0 ? `الفرق: ${difference.toFixed(2)} ر.س` : 'لا يوجد فرق'}`,
      difference === 0 ? 'success' : 'warning'
    );
    
    setShowCloseShiftModal(false);
    setClosingCash('');
    setCloseNotes('');
    loadCurrentShift();
    loadShiftHistory();
  };
  
  const addPayment = async () => {
    if (!paymentAmount || !currentShift) {
      showToast('الرجاء إدخال المبلغ', 'warning');
      return;
    }
    
    const amount = parseFloat(paymentAmount);
    
    await db.payments.add({
      date: new Date(),
      direction: paymentType,
      method: 'cash',
      amount,
      refType: paymentType === 'in' ? 'income' : 'expense',
      shiftId: currentShift.id,
      note: `${paymentCategory ? paymentCategory + ': ' : ''}${paymentNote}`,
    });
    
    showToast(
      paymentType === 'in' 
        ? `تم تسجيل إيراد بمبلغ ${amount.toFixed(2)} ر.س`
        : `تم تسجيل مصروف بمبلغ ${amount.toFixed(2)} ر.س`,
      'success'
    );
    
    setPaymentAmount('');
    setPaymentCategory('');
    setPaymentNote('');
    loadCurrentShift();
    loadTodayMovements();
  };
  
  // Calculate expected cash
  const expectedCash = currentShift
    ? currentShift.openingCash + (currentShift.paymentsIn || 0) - (currentShift.paymentsOut || 0)
    : 0;
  
  const expenseCategories = [
    { value: 'rent', label: 'إيجار' },
    { value: 'utilities', label: 'كهرباء/ماء' },
    { value: 'salary', label: 'رواتب' },
    { value: 'supplies', label: 'مستلزمات' },
    { value: 'transport', label: 'مواصلات' },
    { value: 'maintenance', label: 'صيانة' },
    { value: 'other', label: 'أخرى' },
  ];
  
  const incomeCategories = [
    { value: 'sales', label: 'مبيعات أخرى' },
    { value: 'service', label: 'خدمات' },
    { value: 'other', label: 'أخرى' },
  ];
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">
          الصندوق والورديات
        </h1>
        <div className="flex gap-2">
          {!currentShift ? (
            <Button onClick={() => setShowOpenShiftModal(true)}>
              <Play size={18} className="ml-2" />
              فتح وردية
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setShowHistoryModal(true)}>
                <FileText size={18} className="ml-2" />
                سجل الورديات
              </Button>
              <Button variant="danger" onClick={() => setShowCloseShiftModal(true)}>
                <Square size={18} className="ml-2" />
                إغلاق الوردية
              </Button>
            </>
          )}
        </div>
      </div>
      
      {/* Current Shift Status */}
      {currentShift ? (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard
              title="الرصيد الافتتاحي"
              value={`${currentShift.openingCash.toFixed(2)} ر.س`}
              icon={<Wallet size={24} />}
              color="blue"
            />
            <StatCard
              title="المقبوضات"
              value={`${(currentShift.paymentsIn || 0).toFixed(2)} ر.س`}
              icon={<ArrowDownCircle size={24} />}
              color="primary"
            />
            <StatCard
              title="المصروفات"
              value={`${(currentShift.paymentsOut || 0).toFixed(2)} ر.س`}
              icon={<ArrowUpCircle size={24} />}
              color="red"
            />
            <StatCard
              title="الرصيد المتوقع"
              value={`${expectedCash.toFixed(2)} ر.س`}
              icon={<DollarSign size={24} />}
              color="amber"
            />
          </div>
          
          {/* Shift Info */}
          <Card>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-100 rounded-full">
                  <Clock size={24} className="text-green-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">
                    الوردية الحالية
                  </h3>
                  <p className="text-sm text-slate-500">
                    بدأت في: {new Date(currentShift.openTime).toLocaleString('ar-SA')}
                    {currentShift.user && ` | الموظف: ${currentShift.user.name}`}
                  </p>
                </div>
              </div>
              <Badge variant="success" size="md">نشطة</Badge>
            </div>
          </Card>
          
          {/* Tabs */}
          <Tabs
            tabs={[
              { id: 'movements', label: 'حركة الصندوق', icon: <FileText size={16} /> },
              { id: 'add', label: 'إضافة حركة', icon: <Plus size={16} /> },
            ]}
            defaultTab="movements"
          >
            {(activeTab) => (
              <>
                {activeTab === 'movements' && (
                  <Card padding="none">
                    <Table
                      columns={[
                        {
                          key: 'date',
                          header: 'الوقت',
                          render: (item) => new Date(item.date).toLocaleTimeString('ar-SA'),
                        },
                        {
                          key: 'type',
                          header: 'النوع',
                          render: (item) => (
                            <Badge
                              variant={
                                item.type === 'payment_in' || item.type === 'income' || item.type === 'sale'
                                  ? 'success'
                                  : 'danger'
                              }
                            >
                              {item.type === 'payment_in' || item.type === 'income' || item.type === 'sale'
                                ? 'وارد'
                                : 'صادر'}
                            </Badge>
                          ),
                        },
                        { key: 'description', header: 'الوصف' },
                        {
                          key: 'amount',
                          header: 'المبلغ',
                          render: (item) => (
                            <span
                              className={
                                item.type === 'payment_in' || item.type === 'income' || item.type === 'sale'
                                  ? 'text-green-600'
                                  : 'text-red-600'
                              }
                            >
                              {item.type === 'payment_out' || item.type === 'expense' ? '-' : '+'}
                              {item.amount.toFixed(2)}
                            </span>
                          ),
                        },
                        {
                          key: 'balance',
                          header: 'الرصيد',
                          render: (item) => `${item.balance.toFixed(2)} ر.س`,
                        },
                      ]}
                      data={todayMovements}
                      keyExtractor={(_, index) => index}
                      emptyMessage="لا توجد حركات"
                    />
                  </Card>
                )}
                
                {activeTab === 'add' && (
                  <Card>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Income */}
                      <div
                        className={`p-6 rounded-lg border-2 cursor-pointer transition-all duration-200 ${
                          paymentType === 'in'
                            ? 'border-green-500 bg-green-100'
                            : 'border-slate-200 hover:border-green-300'
                        }`}
                        onClick={() => setPaymentType('in')}
                      >
                        <div className="flex items-center gap-3 mb-4">
                          <ArrowDownCircle
                            size={32}
                            className={paymentType === 'in' ? 'text-green-600' : 'text-slate-400'}
                          />
                          <div>
                            <h3 className="font-bold text-lg">إيراد / مقبوضات</h3>
                            <p className="text-sm text-slate-500">سند قبض</p>
                          </div>
                        </div>
                      </div>
                      
                      {/* Expense */}
                      <div
                        className={`p-6 rounded-lg border-2 cursor-pointer transition-colors ${
                          paymentType === 'out'
                            ? 'border-red-500 bg-red-50'
                            : 'border-slate-200 hover:border-red-300'
                        }`}
                        onClick={() => setPaymentType('out')}
                      >
                        <div className="flex items-center gap-3 mb-4">
                          <ArrowUpCircle
                            size={32}
                            className={paymentType === 'out' ? 'text-red-600' : 'text-slate-400'}
                          />
                          <div>
                            <h3 className="font-bold text-lg">مصروف / صادر</h3>
                            <p className="text-sm text-slate-500">سند صرف</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-6 space-y-4">
                      <Select
                        label="التصنيف"
                        placeholder="اختر التصنيف"
                        options={paymentType === 'in' ? incomeCategories : expenseCategories}
                        value={paymentCategory}
                        onChange={(e) => setPaymentCategory(e.target.value)}
                      />
                      <Input
                        label="المبلغ"
                        type="number"
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                        placeholder="0.00"
                      />
                      <Input
                        label="ملاحظات"
                        value={paymentNote}
                        onChange={(e) => setPaymentNote(e.target.value)}
                        placeholder="وصف الحركة..."
                      />
                      
                      <Button
                        className="w-full"
                        variant={paymentType === 'in' ? 'success' : 'danger'}
                        onClick={addPayment}
                      >
                        {paymentType === 'in' ? (
                          <>
                            <Plus size={18} className="ml-2" />
                            تسجيل إيراد
                          </>
                        ) : (
                          <>
                            <Minus size={18} className="ml-2" />
                            تسجيل مصروف
                          </>
                        )}
                      </Button>
                    </div>
                  </Card>
                )}
              </>
            )}
          </Tabs>
        </>
      ) : (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <Clock size={64} className="mb-4" />
            <p className="text-xl font-medium mb-2">لا توجد وردية مفتوحة</p>
            <p className="text-sm mb-6">افتح وردية جديدة لبدء العمل</p>
            <Button onClick={() => setShowOpenShiftModal(true)}>
              <Play size={18} className="ml-2" />
              فتح وردية
            </Button>
          </div>
        </Card>
      )}
      
      {/* Open Shift Modal */}
      <Modal
        isOpen={showOpenShiftModal}
        onClose={() => setShowOpenShiftModal(false)}
        title="فتح وردية جديدة"
      >
        <div className="space-y-4">
          <Input
            label="الرصيد الافتتاحي"
            type="number"
            value={openingCash}
            onChange={(e) => setOpeningCash(e.target.value)}
            placeholder="0.00"
          />
          
          <div className="flex gap-2 justify-end mt-6">
            <Button variant="secondary" onClick={() => setShowOpenShiftModal(false)}>
              إلغاء
            </Button>
            <Button onClick={openShift}>
              <Play size={18} className="ml-2" />
              فتح الوردية
            </Button>
          </div>
        </div>
      </Modal>
      
      {/* Close Shift Modal */}
      <Modal
        isOpen={showCloseShiftModal}
        onClose={() => setShowCloseShiftModal(false)}
        title="إغلاق الوردية"
      >
        <div className="space-y-4">
          <div className="p-4 bg-slate-100 rounded-lg space-y-2">
            <div className="flex justify-between">
              <span>الرصيد الافتتاحي:</span>
              <span>{currentShift?.openingCash.toFixed(2)} ر.س</span>
            </div>
            <div className="flex justify-between text-green-600">
              <span>المقبوضات:</span>
              <span>+{(currentShift?.paymentsIn || 0).toFixed(2)} ر.س</span>
            </div>
            <div className="flex justify-between text-red-600">
              <span>المصروفات:</span>
              <span>-{(currentShift?.paymentsOut || 0).toFixed(2)} ر.س</span>
            </div>
            <div className="border-t pt-2 flex justify-between font-bold">
              <span>الرصيد المتوقع:</span>
              <span>{expectedCash.toFixed(2)} ر.س</span>
            </div>
          </div>
          
          <Input
            label="الرصيد الفعلي في الصندوق"
            type="number"
            value={closingCash}
            onChange={(e) => setClosingCash(e.target.value)}
            placeholder="0.00"
          />
          
          {closingCash && (
            <div
              className={`p-3 rounded-lg ${
                parseFloat(closingCash) === expectedCash
                  ? 'bg-green-100 text-green-700'
                  : 'bg-amber-100 text-amber-700'
              }`}
            >
              الفرق: {(parseFloat(closingCash) - expectedCash).toFixed(2)} ر.س
            </div>
          )}
          
          <Input
            label="ملاحظات"
            value={closeNotes}
            onChange={(e) => setCloseNotes(e.target.value)}
            placeholder="ملاحظات عند الإغلاق..."
          />
          
          <div className="flex gap-2 justify-end mt-6">
            <Button variant="secondary" onClick={() => setShowCloseShiftModal(false)}>
              إلغاء
            </Button>
            <Button variant="danger" onClick={closeShift}>
              <Square size={18} className="ml-2" />
              إغلاق الوردية
            </Button>
          </div>
        </div>
      </Modal>
      
      {/* History Modal */}
      <Modal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        title="سجل الورديات"
        size="xl"
      >
        <Table
          columns={[
            {
              key: 'openTime',
              header: 'تاريخ الفتح',
              render: (item) => new Date(item.openTime).toLocaleString('ar-SA'),
            },
            {
              key: 'closeTime',
              header: 'تاريخ الإغلاق',
              render: (item) =>
                item.closeTime ? new Date(item.closeTime).toLocaleString('ar-SA') : '-',
            },
            {
              key: 'user',
              header: 'الموظف',
              render: (item) => item.user?.name || '-',
            },
            {
              key: 'openingCash',
              header: 'الافتتاحي',
              render: (item) => `${item.openingCash.toFixed(2)}`,
            },
            {
              key: 'closingCash',
              header: 'الإغلاق',
              render: (item) => item.closingCash ? `${item.closingCash.toFixed(2)}` : '-',
            },
            {
              key: 'difference',
              header: 'الفرق',
              render: (item) =>
                item.difference !== undefined ? (
                  <span className={item.difference === 0 ? 'text-green-600' : 'text-amber-600'}>
                    {item.difference.toFixed(2)}
                  </span>
                ) : (
                  '-'
                ),
            },
            {
              key: 'status',
              header: 'الحالة',
              render: (item) => (
                <Badge variant={item.status === 'open' ? 'success' : 'default'}>
                  {item.status === 'open' ? 'مفتوحة' : 'مغلقة'}
                </Badge>
              ),
            },
          ]}
          data={shiftHistory}
          keyExtractor={(item) => item.id!}
          emptyMessage="لا توجد ورديات"
        />
      </Modal>
    </div>
  );
}
