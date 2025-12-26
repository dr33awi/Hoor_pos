import { Card } from '@/components/ui';
import { Construction } from 'lucide-react';

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">
        {title}
      </h1>

      <Card>
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <Construction size={64} className="mb-4" />
          <p className="text-xl font-medium">قيد التطوير</p>
          <p className="text-sm">هذه الصفحة قيد الإنشاء</p>
        </div>
      </Card>
    </div>
  );
}

export function PurchasesPage() {
  return <PlaceholderPage title="المشتريات" />;
}

export function ReturnsPage() {
  return <PlaceholderPage title="المرتجعات والاستبدال" />;
}

export function CustomersPage() {
  return <PlaceholderPage title="العملاء" />;
}

export function SuppliersPage() {
  return <PlaceholderPage title="الموردين" />;
}

export function CashboxPage() {
  return <PlaceholderPage title="الصندوق والورديات" />;
}

export function SettingsPage() {
  return <PlaceholderPage title="الإعدادات" />;
}
