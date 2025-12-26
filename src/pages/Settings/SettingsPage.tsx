import { useState, useEffect } from 'react';
import {
  Store,
  Palette,
  Database,
  Download,
  Upload,
  Trash2,
  Shield,
  Globe,
  Sun,
  Save,
} from 'lucide-react';
import { Card, CardHeader, Button, Input, Modal, Tabs, Badge } from '@/components/ui';
import { db } from '@/db';
import type { User } from '@/types';
import { useUIStore } from '@/stores';

export function SettingsPage() {
  const { showToast } = useUIStore();
  
  // Settings
  const [, setSettings] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<User[]>([]);
  
  // Form
  const [storeForm, setStoreForm] = useState({
    storeName: '',
    storePhone: '',
    storeAddress: '',
    currency: 'SAR',
    taxEnabled: 'true',
    taxRate: '15',
    receiptFooter: '',
  });
  
  // Modals
  const [showUserModal, setShowUserModal] = useState(false);
  const [showClearDataModal, setShowClearDataModal] = useState(false);
  
  const [userForm, setUserForm] = useState({
    username: '',
    name: '',
    role: 'cashier' as 'admin' | 'manager' | 'cashier',
    password: '',
  });
  
  const [editingUser, setEditingUser] = useState<User | null>(null);
  
  useEffect(() => {
    loadSettings();
    loadUsers();
  }, []);
  
  const loadSettings = async () => {
    const allSettings = await db.settings.toArray();
    const settingsMap: Record<string, string> = {};
    
    allSettings.forEach(s => {
      settingsMap[s.key] = s.value;
    });
    
    setSettings(settingsMap);
    
    setStoreForm({
      storeName: settingsMap.storeName || 'Hoor',
      storePhone: settingsMap.storePhone || '',
      storeAddress: settingsMap.storeAddress || '',
      currency: settingsMap.currency || 'SAR',
      taxEnabled: settingsMap.taxEnabled || 'true',
      taxRate: settingsMap.taxRate || '15',
      receiptFooter: settingsMap.receiptFooter || 'شكراً لزيارتكم',
    });
  };
  
  const loadUsers = async () => {
    const data = await db.users.toArray();
    setUsers(data);
  };
  
  const saveSetting = async (key: string, value: string, type: 'string' | 'number' | 'boolean' = 'string') => {
    const existing = await db.settings.where('key').equals(key).first();
    
    if (existing) {
      await db.settings.update(existing.id!, { value });
    } else {
      await db.settings.add({ key, value, type });
    }
  };
  
  const saveStoreSettings = async () => {
    await Promise.all([
      saveSetting('storeName', storeForm.storeName),
      saveSetting('storePhone', storeForm.storePhone),
      saveSetting('storeAddress', storeForm.storeAddress),
      saveSetting('currency', storeForm.currency),
      saveSetting('taxEnabled', storeForm.taxEnabled, 'boolean'),
      saveSetting('taxRate', storeForm.taxRate, 'number'),
      saveSetting('receiptFooter', storeForm.receiptFooter),
    ]);
    
    showToast('تم حفظ الإعدادات بنجاح', 'success');
    loadSettings();
  };
  
  const openUserForm = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setUserForm({
        username: user.username,
        name: user.name,
        role: user.role,
        password: '',
      });
    } else {
      setEditingUser(null);
      setUserForm({
        username: '',
        name: '',
        role: 'cashier',
        password: '',
      });
    }
    setShowUserModal(true);
  };
  
  const saveUser = async () => {
    if (!userForm.username || !userForm.name) {
      showToast('الرجاء إدخال جميع البيانات المطلوبة', 'warning');
      return;
    }
    
    if (editingUser) {
      await db.users.update(editingUser.id!, {
        username: userForm.username,
        name: userForm.name,
        role: userForm.role,
        ...(userForm.password ? { password: userForm.password } : {}),
      });
      showToast('تم تحديث بيانات المستخدم', 'success');
    } else {
      await db.users.add({
        username: userForm.username,
        name: userForm.name,
        role: userForm.role,
        password: userForm.password,
        isActive: true,
      });
      showToast('تمت إضافة المستخدم بنجاح', 'success');
    }
    
    setShowUserModal(false);
    loadUsers();
  };
  
  const deleteUser = async (user: User) => {
    if (!confirm(`هل أنت متأكد من حذف المستخدم "${user.name}"؟`)) return;
    
    await db.users.delete(user.id!);
    showToast('تم حذف المستخدم', 'success');
    loadUsers();
  };
  
  const exportBackup = async () => {
    try {
      const backup = {
        version: 1,
        date: new Date().toISOString(),
        data: {
          brands: await db.brands.toArray(),
          models: await db.models.toArray(),
          variants: await db.variants.toArray(),
          customers: await db.customers.toArray(),
          suppliers: await db.suppliers.toArray(),
          warehouses: await db.warehouses.toArray(),
          stockMoves: await db.stockMoves.toArray(),
          salesInvoices: await db.salesInvoices.toArray(),
          salesItems: await db.salesItems.toArray(),
          purchaseInvoices: await db.purchaseInvoices.toArray(),
          purchaseItems: await db.purchaseItems.toArray(),
          payments: await db.payments.toArray(),
          users: await db.users.toArray(),
          shifts: await db.shifts.toArray(),
          settings: await db.settings.toArray(),
          returnInvoices: await db.returnInvoices.toArray(),
          returnItems: await db.returnItems.toArray(),
        },
      };
      
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hoor-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      showToast('تم تصدير النسخة الاحتياطية بنجاح', 'success');
    } catch (error) {
      console.error('Backup error:', error);
      showToast('حدث خطأ أثناء تصدير النسخة الاحتياطية', 'error');
    }
  };
  
  const importBackup = async (file: File) => {
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      
      if (!backup.version || !backup.data) {
        showToast('ملف النسخة الاحتياطية غير صالح', 'error');
        return;
      }
      
      // Clear existing data
      await db.transaction('rw', db.tables, async () => {
        for (const table of db.tables) {
          await table.clear();
        }
        
        // Import data
        const { data } = backup;
        
        if (data.brands) await db.brands.bulkAdd(data.brands);
        if (data.models) await db.models.bulkAdd(data.models);
        if (data.variants) await db.variants.bulkAdd(data.variants);
        if (data.customers) await db.customers.bulkAdd(data.customers);
        if (data.suppliers) await db.suppliers.bulkAdd(data.suppliers);
        if (data.warehouses) await db.warehouses.bulkAdd(data.warehouses);
        if (data.stockMoves) await db.stockMoves.bulkAdd(data.stockMoves);
        if (data.salesInvoices) await db.salesInvoices.bulkAdd(data.salesInvoices);
        if (data.salesItems) await db.salesItems.bulkAdd(data.salesItems);
        if (data.purchaseInvoices) await db.purchaseInvoices.bulkAdd(data.purchaseInvoices);
        if (data.purchaseItems) await db.purchaseItems.bulkAdd(data.purchaseItems);
        if (data.payments) await db.payments.bulkAdd(data.payments);
        if (data.users) await db.users.bulkAdd(data.users);
        if (data.shifts) await db.shifts.bulkAdd(data.shifts);
        if (data.settings) await db.settings.bulkAdd(data.settings);
        if (data.returnInvoices) await db.returnInvoices.bulkAdd(data.returnInvoices);
        if (data.returnItems) await db.returnItems.bulkAdd(data.returnItems);
      });
      
      showToast('تم استيراد النسخة الاحتياطية بنجاح', 'success');
      loadSettings();
      loadUsers();
      
    } catch (error) {
      console.error('Import error:', error);
      showToast('حدث خطأ أثناء استيراد النسخة الاحتياطية', 'error');
    }
  };
  
  const clearAllData = async () => {
    try {
      await db.transaction('rw', db.tables, async () => {
        for (const table of db.tables) {
          await table.clear();
        }
      });
      
      showToast('تم حذف جميع البيانات', 'success');
      setShowClearDataModal(false);
      
      // Reinitialize
      window.location.reload();
      
    } catch (error) {
      console.error('Clear data error:', error);
      showToast('حدث خطأ أثناء حذف البيانات', 'error');
    }
  };
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">
          الإعدادات
        </h1>
      </div>
      
      <Tabs
        tabs={[
          { id: 'store', label: 'المتجر', icon: <Store size={16} /> },
          { id: 'users', label: 'المستخدمين', icon: <Shield size={16} /> },
          { id: 'appearance', label: 'المظهر', icon: <Palette size={16} /> },
          { id: 'backup', label: 'النسخ الاحتياطي', icon: <Database size={16} /> },
        ]}
        defaultTab="store"
      >
        {(activeTab) => (
          <>
            {/* Store Settings */}
            {activeTab === 'store' && (
              <Card>
                <CardHeader title="معلومات المتجر" />
                <div className="space-y-4">
                  <Input
                    label="اسم المتجر"
                    value={storeForm.storeName}
                    onChange={(e) => setStoreForm({ ...storeForm, storeName: e.target.value })}
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="رقم الهاتف"
                      value={storeForm.storePhone}
                      onChange={(e) => setStoreForm({ ...storeForm, storePhone: e.target.value })}
                    />
                    <Input
                      label="العملة"
                      value={storeForm.currency}
                      onChange={(e) => setStoreForm({ ...storeForm, currency: e.target.value })}
                    />
                  </div>
                  <Input
                    label="العنوان"
                    value={storeForm.storeAddress}
                    onChange={(e) => setStoreForm({ ...storeForm, storeAddress: e.target.value })}
                  />
                  
                  <div className="border-t border-slate-200 pt-4 mt-4">
                    <h4 className="font-medium text-slate-800 mb-4">إعدادات الضريبة</h4>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={storeForm.taxEnabled === 'true'}
                          onChange={(e) => setStoreForm({ ...storeForm, taxEnabled: e.target.checked ? 'true' : 'false' })}
                          className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                        />
                        <span className="text-slate-700">تفعيل الضريبة</span>
                      </label>
                      {storeForm.taxEnabled === 'true' && (
                        <Input
                          label="نسبة الضريبة %"
                          type="number"
                          value={storeForm.taxRate}
                          onChange={(e) => setStoreForm({ ...storeForm, taxRate: e.target.value })}
                          className="w-32"
                        />
                      )}
                    </div>
                  </div>
                  
                  <div className="border-t border-slate-200 pt-4 mt-4">
                    <Input
                      label="نص أسفل الفاتورة"
                      value={storeForm.receiptFooter}
                      onChange={(e) => setStoreForm({ ...storeForm, receiptFooter: e.target.value })}
                      placeholder="شكراً لزيارتكم..."
                    />
                  </div>
                  
                  <div className="flex justify-end mt-6">
                    <Button onClick={saveStoreSettings}>
                      <Save size={18} className="ml-2" />
                      حفظ الإعدادات
                    </Button>
                  </div>
                </div>
              </Card>
            )}
            
            {/* Users Settings */}
            {activeTab === 'users' && (
              <Card>
                <CardHeader 
                  title="المستخدمين والصلاحيات"
                  action={
                    <Button size="sm" onClick={() => openUserForm()}>
                      إضافة مستخدم
                    </Button>
                  }
                />
                <div className="space-y-3">
                  {users.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-4 bg-slate-50 rounded-lg"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                          <span className="text-primary-600 font-bold">
                            {user.name.charAt(0)}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">
                            {user.name}
                          </p>
                          <p className="text-sm text-slate-500">@{user.username}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={user.role === 'admin' ? 'danger' : user.role === 'manager' ? 'warning' : 'info'}>
                          {user.role === 'admin' ? 'مدير' : user.role === 'manager' ? 'مشرف' : 'كاشير'}
                        </Badge>
                        <Button size="sm" variant="ghost" onClick={() => openUserForm(user)}>
                          تعديل
                        </Button>
                        {user.role !== 'admin' && (
                          <Button size="sm" variant="ghost" onClick={() => deleteUser(user)}>
                            <Trash2 size={16} className="text-red-500" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
            
            {/* Appearance Settings */}
            {activeTab === 'appearance' && (
              <Card>
                <CardHeader title="المظهر والعرض" />
                <div className="space-y-6">
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Globe size={24} className="text-primary-600" />
                      <div>
                        <p className="font-medium text-slate-800">اللغة</p>
                        <p className="text-sm text-slate-500">العربية (افتراضي)</p>
                      </div>
                    </div>
                    <Badge variant="primary">العربية</Badge>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 bg-primary-100 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Sun size={24} className="text-primary-600" />
                      <div>
                        <p className="font-medium text-slate-800">الوضع النهاري</p>
                        <p className="text-sm text-slate-500">المظهر الفاتح مفعّل دائماً</p>
                      </div>
                    </div>
                    <Badge variant="success">مفعّل</Badge>
                  </div>
                </div>
              </Card>
            )}
            
            {/* Backup Settings */}
            {activeTab === 'backup' && (
              <div className="space-y-4">
                <Card>
                  <CardHeader title="النسخ الاحتياطي والاستعادة" />
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-primary-100 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Download size={24} className="text-primary-600" />
                        <div>
                          <p className="font-medium text-slate-800">تصدير نسخة احتياطية</p>
                          <p className="text-sm text-slate-500">تحميل جميع البيانات كملف JSON</p>
                        </div>
                      </div>
                      <Button onClick={exportBackup}>
                        <Download size={18} className="ml-2" />
                        تصدير
                      </Button>
                    </div>
                    
                    <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Upload size={24} className="text-blue-600" />
                        <div>
                          <p className="font-medium text-slate-800">استيراد نسخة احتياطية</p>
                          <p className="text-sm text-slate-500">استعادة البيانات من ملف سابق</p>
                        </div>
                      </div>
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept=".json"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) importBackup(file);
                          }}
                        />
                        <span className="inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 bg-primary-600 text-white hover:bg-primary-500 focus:ring-primary-500 px-4 py-2 text-sm shadow-sm">
                          <Upload size={18} className="ml-2" />
                          استيراد
                        </span>
                      </label>
                    </div>
                  </div>
                </Card>
                
                <Card>
                  <CardHeader title="منطقة الخطر" />
                  <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Trash2 size={24} className="text-red-600" />
                        <div>
                          <p className="font-medium text-red-700">حذف جميع البيانات</p>
                          <p className="text-sm text-red-600/70">هذا الإجراء لا يمكن التراجع عنه!</p>
                        </div>
                      </div>
                      <Button variant="danger" onClick={() => setShowClearDataModal(true)}>
                        حذف الكل
                      </Button>
                    </div>
                  </div>
                </Card>
              </div>
            )}
          </>
        )}
      </Tabs>
      
      {/* User Modal */}
      <Modal
        isOpen={showUserModal}
        onClose={() => setShowUserModal(false)}
        title={editingUser ? 'تعديل المستخدم' : 'إضافة مستخدم'}
      >
        <div className="space-y-4">
          <Input
            label="اسم المستخدم"
            value={userForm.username}
            onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
          />
          <Input
            label="الاسم الكامل"
            value={userForm.name}
            onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
          />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              الصلاحية
            </label>
            <select
              value={userForm.role}
              onChange={(e) => setUserForm({ ...userForm, role: e.target.value as 'admin' | 'manager' | 'cashier' })}
              className="w-full px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-900"
            >
              <option value="cashier">كاشير</option>
              <option value="manager">مشرف</option>
              <option value="admin">مدير</option>
            </select>
          </div>
          <Input
            label={editingUser ? 'كلمة المرور الجديدة (اتركها فارغة للإبقاء على القديمة)' : 'كلمة المرور'}
            type="password"
            value={userForm.password}
            onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
          />
          
          <div className="flex gap-2 justify-end mt-6">
            <Button variant="secondary" onClick={() => setShowUserModal(false)}>
              إلغاء
            </Button>
            <Button onClick={saveUser}>
              حفظ
            </Button>
          </div>
        </div>
      </Modal>
      
      {/* Clear Data Modal */}
      <Modal
        isOpen={showClearDataModal}
        onClose={() => setShowClearDataModal(false)}
        title="تأكيد حذف البيانات"
      >
        <div className="space-y-4">
          <div className="p-4 bg-red-50 rounded-lg">
            <p className="text-red-700 font-medium mb-2">
              تحذير: هذا الإجراء سيحذف جميع البيانات بشكل نهائي!
            </p>
            <ul className="text-sm text-red-600/80 list-disc list-inside">
              <li>جميع المنتجات والماركات</li>
              <li>جميع فواتير المبيعات والمشتريات</li>
              <li>جميع العملاء والموردين</li>
              <li>جميع حركات المخزون</li>
              <li>جميع الإعدادات</li>
            </ul>
          </div>
          
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setShowClearDataModal(false)}>
              إلغاء
            </Button>
            <Button variant="danger" onClick={clearAllData}>
              <Trash2 size={18} className="ml-2" />
              تأكيد الحذف
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
