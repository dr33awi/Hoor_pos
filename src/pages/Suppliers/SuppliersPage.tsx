import { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, FileText, CreditCard, Phone, MapPin } from 'lucide-react';
import { Card, Button, Input, Modal, Table, Badge, StatCard } from '@/components/ui';
import { db } from '@/db';
import type { Supplier } from '@/types';
import { useUIStore } from '@/stores';

interface SupplierWithStats extends Supplier {
  invoicesCount?: number;
  totalPurchases?: number;
}

interface SupplierStatement {
  date: Date;
  type: 'invoice' | 'payment';
  reference: string;
  debit: number;
  credit: number;
  balance: number;
}

export function SuppliersPage() {
  const { showToast } = useUIStore();
  
  const [suppliers, setSuppliers] = useState<SupplierWithStats[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredSuppliers, setFilteredSuppliers] = useState<SupplierWithStats[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierWithStats | null>(null);
  const [statement, setStatement] = useState<SupplierStatement[]>([]);
  
  // Modals
  const [showFormModal, setShowFormModal] = useState(false);
  const [showStatementModal, setShowStatementModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  
  // Form
  const [form, setForm] = useState({
    name: '',
    phone: '',
    address: '',
    notes: '',
  });
  
  // Payment form
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  
  useEffect(() => {
    loadSuppliers();
  }, []);
  
  useEffect(() => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      setFilteredSuppliers(suppliers.filter(s => 
        s.name.toLowerCase().includes(query) ||
        s.phone?.includes(searchQuery)
      ));
    } else {
      setFilteredSuppliers(suppliers);
    }
  }, [searchQuery, suppliers]);
  
  const loadSuppliers = async () => {
    const data = await db.suppliers.toArray();
    
    // Load stats for each supplier
    const withStats = await Promise.all(data.map(async supplier => {
      const invoices = await db.purchaseInvoices
        .where('supplierId')
        .equals(supplier.id!)
        .toArray();
      
      return {
        ...supplier,
        invoicesCount: invoices.length,
        totalPurchases: invoices.reduce((sum, inv) => sum + inv.total, 0),
      };
    }));
    
    setSuppliers(withStats);
  };
  
  const loadStatement = async (supplierId: number) => {
    const invoices = await db.purchaseInvoices
      .where('supplierId')
      .equals(supplierId)
      .toArray();
    
    const payments = await db.payments
      .where('supplierId')
      .equals(supplierId)
      .toArray();
    
    const entries: SupplierStatement[] = [];
    
    // Add invoices (we owe them)
    invoices.forEach(inv => {
      entries.push({
        date: inv.date,
        type: 'invoice',
        reference: inv.invoiceNumber,
        debit: 0,
        credit: inv.total,
        balance: 0,
      });
    });
    
    // Add payments (we paid them)
    payments.forEach(pay => {
      entries.push({
        date: pay.date,
        type: 'payment',
        reference: pay.note || 'دفعة',
        debit: pay.amount,
        credit: 0,
        balance: 0,
      });
    });
    
    // Sort by date and calculate running balance
    entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    let balance = 0;
    entries.forEach(entry => {
      balance += entry.credit - entry.debit; // We owe = positive
      entry.balance = balance;
    });
    
    setStatement(entries);
  };
  
  const openForm = (supplier?: Supplier) => {
    if (supplier) {
      setEditingSupplier(supplier);
      setForm({
        name: supplier.name,
        phone: supplier.phone || '',
        address: supplier.address || '',
        notes: supplier.notes || '',
      });
    } else {
      setEditingSupplier(null);
      setForm({
        name: '',
        phone: '',
        address: '',
        notes: '',
      });
    }
    setShowFormModal(true);
  };
  
  const saveSupplier = async () => {
    if (!form.name) {
      showToast('الرجاء إدخال اسم المورد', 'warning');
      return;
    }
    
    const supplierData = {
      name: form.name,
      phone: form.phone,
      address: form.address,
      notes: form.notes,
    };
    
    if (editingSupplier) {
      await db.suppliers.update(editingSupplier.id!, supplierData);
      showToast('تم تحديث بيانات المورد', 'success');
    } else {
      await db.suppliers.add({
        ...supplierData,
        currentBalance: 0,
      });
      showToast('تمت إضافة المورد بنجاح', 'success');
    }
    
    setShowFormModal(false);
    loadSuppliers();
  };
  
  const deleteSupplier = async (supplier: Supplier) => {
    if (!confirm(`هل أنت متأكد من حذف المورد "${supplier.name}"؟`)) return;
    
    await db.suppliers.delete(supplier.id!);
    showToast('تم حذف المورد', 'success');
    loadSuppliers();
  };
  
  const openStatement = async (supplier: SupplierWithStats) => {
    setSelectedSupplier(supplier);
    await loadStatement(supplier.id!);
    setShowStatementModal(true);
  };
  
  const openPayment = (supplier: SupplierWithStats) => {
    setSelectedSupplier(supplier);
    setPaymentAmount('');
    setPaymentNote('');
    setShowPaymentModal(true);
  };
  
  const savePayment = async () => {
    if (!paymentAmount || !selectedSupplier) {
      showToast('الرجاء إدخال مبلغ الدفعة', 'warning');
      return;
    }
    
    const amount = parseFloat(paymentAmount);
    
    await db.payments.add({
      date: new Date(),
      direction: 'out',
      method: 'cash',
      amount,
      supplierId: selectedSupplier.id,
      refType: 'supplier_payment',
      note: paymentNote || 'سداد للمورد',
    });
    
    // Update supplier balance
    await db.suppliers.update(selectedSupplier.id!, {
      currentBalance: selectedSupplier.currentBalance - amount,
    });
    
    showToast(`تم تسجيل دفعة بمبلغ ${amount.toFixed(2)} ر.س`, 'success');
    setShowPaymentModal(false);
    loadSuppliers();
  };
  
  // Stats
  const totalSuppliers = suppliers.length;
  const totalBalance = suppliers.reduce((sum, s) => sum + s.currentBalance, 0);
  const suppliersWithDebt = suppliers.filter(s => s.currentBalance > 0).length;
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">
          الموردين
        </h1>
        <Button onClick={() => openForm()}>
          <Plus size={18} className="ml-2" />
          مورد جديد
        </Button>
      </div>
      
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="إجمالي الموردين"
          value={totalSuppliers}
          icon={<FileText size={24} />}
          color="blue"
        />
        <StatCard
          title="إجمالي المستحقات للموردين"
          value={`${totalBalance.toFixed(2)} ر.س`}
          icon={<CreditCard size={24} />}
          color="amber"
        />
        <StatCard
          title="موردين لهم مستحقات"
          value={suppliersWithDebt}
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
      
      {/* Suppliers List */}
      <Card padding="none">
        <Table
          columns={[
            { key: 'name', header: 'اسم المورد' },
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
                  <Button size="sm" variant="ghost" onClick={() => deleteSupplier(item)}>
                    <Trash2 size={16} className="text-red-500" />
                  </Button>
                </div>
              ),
            },
          ]}
          data={filteredSuppliers}
          keyExtractor={(item) => item.id!}
          emptyMessage="لا يوجد موردين"
        />
      </Card>
      
      {/* Form Modal */}
      <Modal
        isOpen={showFormModal}
        onClose={() => setShowFormModal(false)}
        title={editingSupplier ? 'تعديل بيانات المورد' : 'إضافة مورد جديد'}
      >
        <div className="space-y-4">
          <Input
            label="اسم المورد"
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
            label="ملاحظات"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          
          <div className="flex gap-2 justify-end mt-6">
            <Button variant="secondary" onClick={() => setShowFormModal(false)}>
              إلغاء
            </Button>
            <Button onClick={saveSupplier}>
              حفظ
            </Button>
          </div>
        </div>
      </Modal>
      
      {/* Statement Modal */}
      <Modal
        isOpen={showStatementModal}
        onClose={() => setShowStatementModal(false)}
        title={`كشف حساب: ${selectedSupplier?.name}`}
        size="xl"
      >
        <div className="mb-4 p-4 bg-slate-100 rounded-lg">
          <div className="flex justify-between">
            <span>الرصيد المستحق للمورد:</span>
            <span className={`font-bold ${(selectedSupplier?.currentBalance || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {(selectedSupplier?.currentBalance || 0).toFixed(2)} ر.س
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
                  {item.type === 'invoice' ? 'فاتورة مشتريات' : 'دفعة'}
                </Badge>
              ),
            },
            { key: 'reference', header: 'المرجع' },
            {
              key: 'debit',
              header: 'مدفوع',
              render: (item) => item.debit > 0 ? `${item.debit.toFixed(2)}` : '-',
            },
            {
              key: 'credit',
              header: 'مستحق',
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
        title={`تسجيل دفعة للمورد: ${selectedSupplier?.name}`}
      >
        <div className="space-y-4">
          <div className="p-4 bg-amber-50 rounded-lg">
            <p className="text-sm text-amber-700">
              الرصيد المستحق للمورد: <span className="font-bold">{selectedSupplier?.currentBalance.toFixed(2)} ر.س</span>
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
