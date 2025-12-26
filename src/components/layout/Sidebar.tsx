import { NavLink } from 'react-router-dom';
import {
  ShoppingCart,
  Package,
  Users,
  Truck,
  RefreshCw,
  Wallet,
  BarChart3,
  Settings,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useUIStore } from '@/stores';

const menuItems = [
  { path: '/', icon: ShoppingCart, label: 'نقطة البيع', labelEn: 'POS' },
  { path: '/products', icon: Package, label: 'المنتجات', labelEn: 'Products' },
  { path: '/purchases', icon: Truck, label: 'المشتريات', labelEn: 'Purchases' },
  { path: '/returns', icon: RefreshCw, label: 'المرتجعات', labelEn: 'Returns' },
  { path: '/customers', icon: Users, label: 'العملاء', labelEn: 'Customers' },
  { path: '/suppliers', icon: Users, label: 'الموردين', labelEn: 'Suppliers' },
  { path: '/cashbox', icon: Wallet, label: 'الصندوق', labelEn: 'Cashbox' },
  { path: '/reports', icon: BarChart3, label: 'التقارير', labelEn: 'Reports' },
  { path: '/settings', icon: Settings, label: 'الإعدادات', labelEn: 'Settings' },
];

export function Sidebar() {
  const { sidebarOpen, sidebarCollapsed, toggleSidebar, toggleSidebarCollapse } = useUIStore();

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 right-0 h-full bg-primary-600 text-white z-50
          transition-all duration-300 ease-in-out shadow-xl
          ${sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
          ${sidebarCollapsed ? 'w-20' : 'w-64'}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-primary-500/50">
          {!sidebarCollapsed && (
            <h1 className="text-xl font-bold text-secondary-300">Hoor</h1>
          )}
          
          {/* Mobile close button */}
          <button
            onClick={toggleSidebar}
            className="lg:hidden p-2 hover:bg-primary-500 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
          
          {/* Desktop collapse button */}
          <button
            onClick={toggleSidebarCollapse}
            className="hidden lg:block p-2 hover:bg-primary-500 rounded-lg transition-colors"
          >
            {sidebarCollapsed ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-2">
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => window.innerWidth < 1024 && toggleSidebar()}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200
                ${isActive
                  ? 'bg-secondary-300 text-primary-700 font-semibold shadow-sm'
                  : 'text-secondary-200 hover:bg-primary-500 hover:text-white'
                }
                ${sidebarCollapsed ? 'justify-center' : ''}`
              }
            >
              <item.icon size={22} />
              {!sidebarCollapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Mobile menu button */}
      <button
        onClick={toggleSidebar}
        className="fixed top-4 right-4 z-30 lg:hidden p-2 bg-primary-600 text-white rounded-lg shadow-lg hover:bg-primary-500 transition-colors"
      >
        <Menu size={24} />
      </button>
    </>
  );
}
