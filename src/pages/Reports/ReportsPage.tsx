import { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Package,
  ShoppingCart,
  DollarSign,
  RefreshCw,
} from 'lucide-react';
import { Card, CardHeader, Button, Input, StatCard, Table, Badge, Tabs } from '@/components/ui';
import { db, getVariantStock } from '@/db';
import type { Variant, Model, Brand } from '@/types';

interface SalesByProduct {
  variantId: number;
  modelName: string;
  color: string;
  size: string;
  qty: number;
  revenue: number;
  profit: number;
}

interface SalesByBrand {
  brandId: number;
  brandName: string;
  qty: number;
  revenue: number;
}

interface StockItem {
  variant: Variant;
  model?: Model;
  brand?: Brand;
  stock: number;
  value: number;
}

export function ReportsPage() {
  // Date range
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(1); // First day of month
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  
  // Report data
  const [salesSummary, setSalesSummary] = useState({
    totalSales: 0,
    totalRevenue: 0,
    totalCost: 0,
    grossProfit: 0,
    averageOrderValue: 0,
    totalReturns: 0,
  });
  
  const [salesByProduct, setSalesByProduct] = useState<SalesByProduct[]>([]);
  const [salesByBrand, setSalesByBrand] = useState<SalesByBrand[]>([]);
  const [stockReport, setStockReport] = useState<StockItem[]>([]);
  const [lowStockItems, setLowStockItems] = useState<StockItem[]>([]);
  const [deadStock, setDeadStock] = useState<StockItem[]>([]);
  
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    loadReports();
  }, [startDate, endDate]);
  
  const loadReports = async () => {
    setLoading(true);
    
    try {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      
      // Get sales invoices
      const invoices = await db.salesInvoices
        .where('date')
        .between(start, end)
        .filter(inv => inv.status !== 'cancelled')
        .toArray();
      
      // Get all sales items for these invoices
      const invoiceIds = invoices.map(inv => inv.id!);
      const allItems = await db.salesItems.toArray();
      const items = allItems.filter(item => invoiceIds.includes(item.invoiceId));
      
      // Get returns
      const returns = await db.returnInvoices
        .where('date')
        .between(start, end)
        .toArray();
      
      // Calculate summary
      const totalRevenue = invoices.reduce((sum, inv) => sum + inv.total, 0);
      const totalCost = items.reduce((sum, item) => sum + (item.unitCostSnapshot * item.qty), 0);
      const totalReturns = returns.reduce((sum, ret) => sum + ret.returnTotal, 0);
      
      setSalesSummary({
        totalSales: invoices.length,
        totalRevenue,
        totalCost,
        grossProfit: totalRevenue - totalCost,
        averageOrderValue: invoices.length > 0 ? totalRevenue / invoices.length : 0,
        totalReturns,
      });
      
      // Sales by product
      const productMap = new Map<number, SalesByProduct>();
      
      for (const item of items) {
        const variant = await db.variants.get(item.variantId);
        const model = variant ? await db.models.get(variant.modelId) : undefined;
        
        if (!variant) continue;
        
        const existing = productMap.get(item.variantId);
        const profit = item.lineTotal - (item.unitCostSnapshot * item.qty);
        
        if (existing) {
          existing.qty += item.qty;
          existing.revenue += item.lineTotal;
          existing.profit += profit;
        } else {
          productMap.set(item.variantId, {
            variantId: item.variantId,
            modelName: model?.name || 'غير معروف',
            color: variant.color,
            size: variant.size,
            qty: item.qty,
            revenue: item.lineTotal,
            profit,
          });
        }
      }
      
      const sortedProducts = Array.from(productMap.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 20);
      
      setSalesByProduct(sortedProducts);
      
      // Sales by brand
      const brandMap = new Map<number, SalesByBrand>();
      
      for (const item of items) {
        const variant = await db.variants.get(item.variantId);
        const model = variant ? await db.models.get(variant.modelId) : undefined;
        const brand = model ? await db.brands.get(model.brandId) : undefined;
        
        if (!brand) continue;
        
        const existing = brandMap.get(brand.id!);
        
        if (existing) {
          existing.qty += item.qty;
          existing.revenue += item.lineTotal;
        } else {
          brandMap.set(brand.id!, {
            brandId: brand.id!,
            brandName: brand.nameAr || brand.name,
            qty: item.qty,
            revenue: item.lineTotal,
          });
        }
      }
      
      setSalesByBrand(Array.from(brandMap.values()).sort((a, b) => b.revenue - a.revenue));
      
      // Stock report
      const variants = await db.variants.filter(v => v.isActive).toArray();
      const stockItems: StockItem[] = [];
      
      for (const variant of variants) {
        const stock = await getVariantStock(variant.id!);
        const model = await db.models.get(variant.modelId);
        const brand = model ? await db.brands.get(model.brandId) : undefined;
        
        stockItems.push({
          variant,
          model,
          brand,
          stock,
          value: stock * variant.costPrice,
        });
      }
      
      setStockReport(stockItems.sort((a, b) => b.value - a.value));
      
      // Low stock
      setLowStockItems(stockItems.filter(item => 
        item.stock <= (item.variant.minStock || 5) && item.stock > 0
      ));
      
      // Dead stock (no sales in last 90 days)
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      
      const recentSalesItemIds = new Set(
        (await db.salesItems.toArray())
          .filter(item => {
            const invoice = invoices.find(inv => inv.id === item.invoiceId);
            return invoice && new Date(invoice.date) >= ninetyDaysAgo;
          })
          .map(item => item.variantId)
      );
      
      setDeadStock(stockItems.filter(item => 
        item.stock > 0 && !recentSalesItemIds.has(item.variant.id!)
      ));
      
    } catch (error) {
      console.error('Error loading reports:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const totalStockValue = stockReport.reduce((sum, item) => sum + item.value, 0);
  const totalStockQty = stockReport.reduce((sum, item) => sum + item.stock, 0);
  
  const profitMargin = salesSummary.totalRevenue > 0
    ? (salesSummary.grossProfit / salesSummary.totalRevenue * 100)
    : 0;
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">
          التقارير
        </h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={loadReports} disabled={loading}>
            <RefreshCw size={18} className={`ml-2 ${loading ? 'animate-spin' : ''}`} />
            تحديث
          </Button>
        </div>
      </div>
      
      {/* Date Range */}
      <Card>
        <div className="flex gap-4 items-end flex-wrap">
          <Input
            label="من تاريخ"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <Input
            label="إلى تاريخ"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const today = new Date();
                setStartDate(today.toISOString().split('T')[0]);
                setEndDate(today.toISOString().split('T')[0]);
              }}
            >
              اليوم
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const today = new Date();
                const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
                setStartDate(weekAgo.toISOString().split('T')[0]);
                setEndDate(today.toISOString().split('T')[0]);
              }}
            >
              آخر 7 أيام
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const today = new Date();
                const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
                setStartDate(monthStart.toISOString().split('T')[0]);
                setEndDate(today.toISOString().split('T')[0]);
              }}
            >
              هذا الشهر
            </Button>
          </div>
        </div>
      </Card>
      
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="إجمالي المبيعات"
          value={`${salesSummary.totalRevenue.toFixed(2)} ر.س`}
          subtitle={`${salesSummary.totalSales} فاتورة`}
          icon={<ShoppingCart size={24} />}
          color="primary"
        />
        <StatCard
          title="صافي الربح"
          value={`${salesSummary.grossProfit.toFixed(2)} ر.س`}
          subtitle={`نسبة الربح: ${profitMargin.toFixed(1)}%`}
          icon={<TrendingUp size={24} />}
          color="blue"
        />
        <StatCard
          title="متوسط قيمة الفاتورة"
          value={`${salesSummary.averageOrderValue.toFixed(2)} ر.س`}
          icon={<DollarSign size={24} />}
          color="purple"
        />
        <StatCard
          title="المرتجعات"
          value={`${salesSummary.totalReturns.toFixed(2)} ر.س`}
          icon={<TrendingDown size={24} />}
          color="red"
        />
      </div>
      
      {/* Reports Tabs */}
      <Tabs
        tabs={[
          { id: 'sales', label: 'المبيعات', icon: <BarChart3 size={16} /> },
          { id: 'products', label: 'المنتجات', icon: <Package size={16} /> },
          { id: 'stock', label: 'المخزون', icon: <Package size={16} /> },
        ]}
        defaultTab="sales"
      >
        {(activeTab) => (
          <>
            {activeTab === 'sales' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Sales by Brand */}
                <Card>
                  <CardHeader title="المبيعات حسب الماركة" />
                  <Table
                    columns={[
                      { key: 'brandName', header: 'الماركة' },
                      { key: 'qty', header: 'الكمية' },
                      {
                        key: 'revenue',
                        header: 'الإيرادات',
                        render: (item) => `${item.revenue.toFixed(2)} ر.س`,
                      },
                    ]}
                    data={salesByBrand}
                    keyExtractor={(item) => item.brandId}
                    emptyMessage="لا توجد بيانات"
                  />
                </Card>
                
                {/* Top Products */}
                <Card>
                  <CardHeader title="أكثر المنتجات مبيعاً" />
                  <Table
                    columns={[
                      {
                        key: 'product',
                        header: 'المنتج',
                        render: (item) => `${item.modelName} - ${item.color} - ${item.size}`,
                      },
                      { key: 'qty', header: 'الكمية' },
                      {
                        key: 'revenue',
                        header: 'الإيرادات',
                        render: (item) => `${item.revenue.toFixed(2)}`,
                      },
                    ]}
                    data={salesByProduct.slice(0, 10)}
                    keyExtractor={(item) => item.variantId}
                    emptyMessage="لا توجد بيانات"
                  />
                </Card>
              </div>
            )}
            
            {activeTab === 'products' && (
              <div className="space-y-6">
                {/* Low Stock */}
                <Card>
                  <CardHeader 
                    title="منتجات قاربت على النفاد" 
                    subtitle={`${lowStockItems.length} منتج`}
                  />
                  <Table
                    columns={[
                      {
                        key: 'product',
                        header: 'المنتج',
                        render: (item) => (
                          <div>
                            <p className="font-medium">{item.model?.name}</p>
                            <p className="text-sm text-slate-500">
                              {item.variant.color} - {item.variant.size}
                            </p>
                          </div>
                        ),
                      },
                      {
                        key: 'brand',
                        header: 'الماركة',
                        render: (item) => item.brand?.name || '-',
                      },
                      {
                        key: 'stock',
                        header: 'المخزون',
                        render: (item) => (
                          <Badge variant="warning">{item.stock}</Badge>
                        ),
                      },
                      {
                        key: 'minStock',
                        header: 'الحد الأدنى',
                        render: (item) => item.variant.minStock || 5,
                      },
                    ]}
                    data={lowStockItems}
                    keyExtractor={(item) => item.variant.id!}
                    emptyMessage="لا توجد منتجات قاربت على النفاد"
                  />
                </Card>
                
                {/* Dead Stock */}
                <Card>
                  <CardHeader 
                    title="منتجات راكدة (بدون مبيعات 90 يوم)" 
                    subtitle={`${deadStock.length} منتج`}
                  />
                  <Table
                    columns={[
                      {
                        key: 'product',
                        header: 'المنتج',
                        render: (item) => (
                          <div>
                            <p className="font-medium">{item.model?.name}</p>
                            <p className="text-sm text-slate-500">
                              {item.variant.color} - {item.variant.size}
                            </p>
                          </div>
                        ),
                      },
                      {
                        key: 'brand',
                        header: 'الماركة',
                        render: (item) => item.brand?.name || '-',
                      },
                      { key: 'stock', header: 'المخزون' },
                      {
                        key: 'value',
                        header: 'القيمة',
                        render: (item) => `${item.value.toFixed(2)} ر.س`,
                      },
                    ]}
                    data={deadStock}
                    keyExtractor={(item) => item.variant.id!}
                    emptyMessage="لا توجد منتجات راكدة"
                  />
                </Card>
              </div>
            )}
            
            {activeTab === 'stock' && (
              <div className="space-y-6">
                {/* Stock Summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <StatCard
                    title="إجمالي الأصناف"
                    value={stockReport.length}
                    icon={<Package size={24} />}
                    color="blue"
                  />
                  <StatCard
                    title="إجمالي الكميات"
                    value={totalStockQty}
                    icon={<Package size={24} />}
                    color="primary"
                  />
                  <StatCard
                    title="قيمة المخزون"
                    value={`${totalStockValue.toFixed(2)} ر.س`}
                    icon={<DollarSign size={24} />}
                    color="purple"
                  />
                </div>
                
                {/* Stock List */}
                <Card padding="none">
                  <div className="p-4 border-b border-slate-200">
                    <h3 className="font-bold text-slate-800">
                      تقرير المخزون الحالي
                    </h3>
                  </div>
                  <Table
                    columns={[
                      {
                        key: 'product',
                        header: 'المنتج',
                        render: (item) => (
                          <div>
                            <p className="font-medium">{item.model?.name}</p>
                            <p className="text-sm text-slate-500">
                              {item.variant.sku}
                            </p>
                          </div>
                        ),
                      },
                      {
                        key: 'details',
                        header: 'التفاصيل',
                        render: (item) => `${item.variant.color} - ${item.variant.size}`,
                      },
                      {
                        key: 'brand',
                        header: 'الماركة',
                        render: (item) => item.brand?.name || '-',
                      },
                      {
                        key: 'stock',
                        header: 'الكمية',
                        render: (item) => (
                          <Badge
                            variant={
                              item.stock <= 0
                                ? 'danger'
                                : item.stock <= (item.variant.minStock || 5)
                                ? 'warning'
                                : 'success'
                            }
                          >
                            {item.stock}
                          </Badge>
                        ),
                      },
                      {
                        key: 'cost',
                        header: 'التكلفة',
                        render: (item) => `${item.variant.costPrice.toFixed(2)}`,
                      },
                      {
                        key: 'value',
                        header: 'القيمة',
                        render: (item) => `${item.value.toFixed(2)} ر.س`,
                      },
                    ]}
                    data={stockReport}
                    keyExtractor={(item) => item.variant.id!}
                    emptyMessage="لا توجد منتجات"
                  />
                </Card>
              </div>
            )}
          </>
        )}
      </Tabs>
    </div>
  );
}
