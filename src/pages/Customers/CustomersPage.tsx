import { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, FileText, CreditCard, Phone, MapPin } from 'lucide-react';
import { Card, Button, Input, Modal, Table, Badge, StatCard } from '@/components/ui';
import { db } from '@/db';
import type { Customer } from '@/types';
import { useUIStore } from '@/stores';

interface CustomerWithStats extends Customer {
  invoicesCount?: number;
  totalPurchases?: number;
}

interface CustomerStatement {
  date: Date;
  type: 'invoice' | 'payment' | 'return';
  reference: string;
  debit: number;
  credit: number;
  balance: number;
}

export function CustomersPage() {
  const { showToast } = useUIStore();
  
  const [customers, setCustomers] = useState<CustomerWithStats[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredCustomers, setFilteredCustomers] = useState<CustomerWithStats[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithStats | null>(null);
  const [statement, setStatement] = useState<CustomerStatement[]>([]);
  
  // Modals
  const [showFormModal, setShowFormModal] = useState(false);
  const [showStatementModal, setShowStatementModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  
  // Form
  const [form, setForm] = useState({
    name: '',
    phone: '',
    address: '',
    creditLimit: '',
    notes: '',
  });
  
  // Payment form
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  
  useEffect(() => {
    loadCustomers();
  }, []);
  
  useEffect(() => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      setFilteredCustomers(customers.filter(c => 
        c.name.toLowerCase().includes(query) ||
        c.phone?.includes(searchQuery)
      ));
    } else {
      setFilteredCustomers(customers);
    }
  }, [searchQuery, customers]);
  
  const loadCustomers = async () => {
    const data = await db.customers.toArray();
    
    // Load stats for each customer
    const withStats = await Promise.all(data.map(async customer => {
      const invoices = await db.salesInvoices
        .where('customerId')
        .equals(customer.id!)
        .toArray();
      
      return {
        ...customer,
        invoicesCount: invoices.length,
        totalPurchases: invoices.reduce((sum, inv) => sum + inv.total, 0),
      };
    }));
    
    setCustomers(withStats);
  };
  
  const loadStatement = async (customerId: number) => {
    const invoices = await db.salesInvoices
      .where('customerId')
      .equals(customerId)
      .toArray();
    
    const payments = await db.payments
      .where('customerId')
      .equals(customerId)
      .toArray();
    
    const entries: CustomerStatement[] = [];
    
    // Add invoices
    invoices.forEach(inv => {
      entries.push({
        date: inv.date,
        type: 'invoice',
        reference: inv.invoiceNumber,
        debit: inv.total,
        credit: 0,
        balance: 0,
      });
    });
    
    // Add payments
    payments.forEach(pay => {
      entries.push({
        date: pay.date,
        type: 'payment',
        reference: pay.note || 'دفعة',
        debit: 0,
        credit: pay.amount,
        balance: 0,
      });
    });
    
    // Sort by date and calculate running balance
    entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    let balance = 0;
    entries.forEach(entry => {
      balance += entry.debit - entry.credit;
      entry.balance = balance;
    });
    
    setStatement(entries);
  };
  
  const openForm = (customer?: Customer) => {
    if (customer) {
      setEditingCustomer(customer);
      setForm({
        name: customer.name,
        phone: customer.phone || '',
        address: customer.address || '',
        creditLimit: customer.creditLimit.toString(),
        notes: customer.notes || '',
      });
    } else {
      setEditingCustomer(null);
      setForm({
        name: '',
        phone: '',
        address: '',
        creditLimit: '0',
        notes: '',
      });
    }
    setShowFormModal(true);
  };
  
  const saveCustomer = async () => {
    if (!form.name) {
      showToast('الرجاء إدخال اسم العميل', 'warning');
      return;
    }
    
    const customerData = {
      name: form.name,
      phone: form.phone,
      address: form.address,
      creditLimit: parseFloat(form.creditLimit) || 0,
      notes: form.notes,
    };
    
    if (editingCustomer) {
      await db.customers.update(editingCustomer.id!, customerData);
      showToast('تم تحديث بيانات العميل', 'success');
    } else {
      await db.customers.add({
        ...customerData,
        currentBalance: 0,
      });
      showToast('تمت إضافة العميل بنجاح', 'success');
    }
    
    setShowFormModal(false);
    loadCustomers();
  };
  
  const deleteCustomer = async (customer: Customer) => {
    if (!confirm(`هل أنت متأكد من حذف العميل "${customer.name}"؟`)) return;
    
    await db.customers.delete(customer.id!);
    showToast('تم حذف العميل', 'success');
    loadCustomers();
  };
  
  const openStatement = async (customer: CustomerWithStats) => {
    setSelectedCustomer(customer);
    await loadStatement(customer.id!);
    setShowStatementModal(true);
  };
  
  const openPayment = (customer: CustomerWithStats) => {
    setSelectedCustomer(customer);
    setPaymentAmount('');
    setPaymentNote('');
    setShowPaymentModal(true);
  };
  
  const savePayment = async () => {
    if (!paymentAmount || !selectedCustomer) {
      showToast('الرجاء إدخال مبلغ الدفعة', 'warning');
      return;
    }
    
    const amount = parseFloat(paymentAmount);
    
    await db.payments.add({
      date: new Date(),
      direction: 'in',
      method: 'cash',
      amount,
      customerId: selectedCustomer.id,
      refType: 'customer_payment',
      note: paymentNote || 'سداد رصيد',
    });
    
    // Update customer balance
    await db.customers.update(selectedCustomer.id!, {
      currentBalance: selectedCustomer.currentBalance - amount,
    });
    
    showToast(`تم تسجيل دفعة بمبلغ ${amount.toFixed(2)} ر.س`, 'success');
    setShowPaymentModal(false);
    loadCustomers();
  };
  
  // Stats
  const totalCustomers = customers.length;
  const totalBalance = customers.reduce((sum, c) => sum + c.currentBalance, 0);
  const customersWithDebt = customers.filter(c => c.currentBalance > 0).length;
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">
          العملاء
        </h1>
        <Button onClick={() => openForm()}>
          <Plus size={18} className="ml-2" />
          عميل جديد
        </Button>
      </div>
      
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="إجمالي العملاء"
          value={totalCustomers}
          icon={<FileText size={24} />}
          color="blue"
        />
        <StatCard
          title="إجمالي الأرصدة المستحقة"
          value={`${totalBalance.toFixed(2)} ر.س`}
          icon={<CreditCard size={24} />}
          color="amber"
        />
        <StatCard
          title="عملاء لديهم ديون"
          value={customersWithDebt}
          icon={<FileText size={24} />}
          color="red"
        />
      </div>
      
      {/* Search */}
      <Card>
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="ابحث بالاسم أو رقم الهاتف..."
          icon={<Search size={18} />}
        />
      </Card>
      
      {/* Customers List */}
      <Card padding="none">
        <Table
          columns={[
            { key: 'name', header: 'اسم العميل' },
            { 
              key: 'phone', 
              header: 'الهاتف',
              render: (item) => item.phone || '-',
            },
            {
              key: 'invoicesCount',
              header: 'الفواتير',
              render: (item) => item.invoicesCount || 0,
            },
            {
              key: 'totalPurchases',
              header: 'إجمالي المشتريات',
              render: (item) => `${(item.totalPurchases || 0).toFixed(2)} ر.س`,
            },
            {
              key: 'currentBalance',
              header: 'الرصيد المستحق',
              render: (item) => (
                <Badge variant={item.currentBalance > 0 ? 'danger' : 'success'}>
                  {item.currentBalance.toFixed(2)} ر.س
                </Badge>
              ),
            },
            {
              key: 'actions',
              header: 'الإجراءات',
              render: (item) => (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openStatement(item)}>
                    <FileText size={16} />
                  </Button>
                  {item.currentBalance > 0 && (
                    <Button size="sm" variant="ghost" onClick={() => openPayment(item)}>
                      <CreditCard size={16} />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => openForm(item)}>
                    <Edit2 size={16} />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteCustomer(item)}>
                    <Trash2 size={16} className="text-red-500" />
                  </Button>
                </div>
              ),
            },
          ]}
          data={filteredCustomers}
          keyExtractor={(item) => item.id!}
          emptyMessage="لا يوجد عملاء"
        />
      </Card>
      
      {/* Form Modal */}
      <Modal
        isOpen={showFormModal}
        onClose={() => setShowFormModal(false)}
        title={editingCustomer ? 'تعديل بيانات العميل' : 'إضافة عميل جديد'}
      >
        <div className="space-y-4">
          <Input
            label="اسم العميل"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="رقم الهاتف"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            icon={<Phone size={18} />}
          />
          <Input
            label="العنوان"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            icon={<MapPin size={18} />}
          />
          <Input
            label="حد الائتمان"
            type="number"
            value={form.creditLimit}
            onChange={(e) => setForm({ ...form, creditLimit: e.target.value })}
          />
          <Input
            label="ملاحظات"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          
          <div className="flex gap-2 justify-end mt-6">
            <Button variant="secondary" onClick={() => setShowFormModal(false)}>
              إلغاء
            </Button>
            <Button onClick={saveCustomer}>
              حفظ
            </Button>
          </div>
        </div>
      </Modal>
      
      {/* Statement Modal */}
      <Modal
        isOpen={showStatementModal}
        onClose={() => setShowStatementModal(false)}
        title={`كشف حساب: ${selectedCustomer?.name}`}
        size="xl"
      >
        <div className="mb-4 p-4 bg-slate-100 rounded-lg">
          <div className="flex justify-between">
            <span>الرصيد الحالي:</span>
            <span className={`font-bold ${(selectedCustomer?.currentBalance || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {(selectedCustomer?.currentBalance || 0).toFixed(2)} ر.س
            </span>
          </div>
        </div>
        
        <Table
          columns={[
            {
              key: 'date',
              header: 'التاريخ',
              render: (item) => new Date(item.date).toLocaleDateString('ar-SA'),
            },
            {
              key: 'type',
              header: 'النوع',
              render: (item) => (
                <Badge variant={item.type === 'invoice' ? 'info' : 'success'}>
                  {item.type === 'invoice' ? 'فاتورة' : 'دفعة'}
                </Badge>
              ),
            },
            { key: 'reference', header: 'المرجع' },
            {
              key: 'debit',
              header: 'مدين',
              render: (item) => item.debit > 0 ? `${item.debit.toFixed(2)}` : '-',
            },
            {
              key: 'credit',
              header: 'دائن',
              render: (item) => item.credit > 0 ? `${item.credit.toFixed(2)}` : '-',
            },
            {
              key: 'balance',
              header: 'الرصيد',
              render: (item) => (
                <span className={item.balance > 0 ? 'text-red-600' : 'text-green-600'}>
                  {item.balance.toFixed(2)}
                </span>
              ),
            },
          ]}
          data={statement}
          keyExtractor={(_, index) => index}
          emptyMessage="لا توجد حركات"
        />
      </Modal>
      
      {/* Payment Modal */}
      <Modal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        title={`تسجيل دفعة: ${selectedCustomer?.name}`}
      >
        <div className="space-y-4">
          <div className="p-4 bg-amber-50 rounded-lg">
            <p className="text-sm text-amber-700">
              الرصيد المستحق: <span className="font-bold">{selectedCustomer?.currentBalance.toFixed(2)} ر.س</span>
            </p>
          </div>
          
          <Input
            label="مبلغ الدفعة"
            type="number"
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
            placeholder="0.00"
          />
          <Input
            label="ملاحظات"
            value={paymentNote}
            onChange={(e) => setPaymentNote(e.target.value)}
            placeholder="ملاحظات اختيارية..."
          />
          
          <div className="flex gap-2 justify-end mt-6">
            <Button variant="secondary" onClick={() => setShowPaymentModal(false)}>
              إلغاء
            </Button>
            <Button onClick={savePayment}>
              تسجيل الدفعة
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
