import { useAuthStore } from '@/stores';
import { User, LogOut, Clock } from 'lucide-react';

export function Header() {
  const { currentUser, currentShift, logout } = useAuthStore();

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shadow-sm">
      {/* Title */}
      <div>
        <h2 className="text-lg font-semibold text-primary-600">
         Hoor
        </h2>
        {currentShift && (
          <div className="flex items-center gap-1 text-sm text-green-600">
            <Clock size={14} />
            <span>الوردية مفتوحة</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4">
        {/* User info */}
        {currentUser && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-2 bg-primary-100 text-primary-700 rounded-lg">
              <User size={18} />
              <span className="text-sm font-medium">{currentUser.name}</span>
            </div>
            
            <button
              onClick={logout}
              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="تسجيل الخروج"
            >
              <LogOut size={20} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
