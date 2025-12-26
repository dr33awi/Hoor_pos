import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { MainLayout } from '@/components/layout';
import {
  POSPage,
  ProductsPage,
  ReportsPage,
  PurchasesPage,
  ReturnsPage,
  CustomersPage,
  SuppliersPage,
  CashboxPage,
  SettingsPage,
} from '@/pages';
import { initializeDatabase } from '@/db';
import { useUIStore } from '@/stores';
import './index.css';

function App() {
  const { darkMode } = useUIStore();

  useEffect(() => {
    // Initialize database with default data
    initializeDatabase();
  }, []);

  useEffect(() => {
    // Apply dark mode
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<POSPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="purchases" element={<PurchasesPage />} />
          <Route path="returns" element={<ReturnsPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="suppliers" element={<SuppliersPage />} />
          <Route path="cashbox" element={<CashboxPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
