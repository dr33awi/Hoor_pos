import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useUIStore } from '@/stores';

export function MainLayout() {
  const { sidebarCollapsed } = useUIStore();

  return (
    <div className="min-h-screen bg-slate-100" dir="rtl">
      <Sidebar />
      
      <div
        className={`
          transition-all duration-300
          ${sidebarCollapsed ? 'lg:mr-20' : 'lg:mr-64'}
        `}
      >
        <Header />
        
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
