import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Shift } from '@/types';
import { db } from '@/db';

interface AuthState {
  currentUser: User | null;
  currentShift: Shift | null;
  isAuthenticated: boolean;
  
  // Actions
  login: (username: string, password?: string) => Promise<boolean>;
  logout: () => void;
  openShift: (openingCash: number) => Promise<boolean>;
  closeShift: (closingCash: number, notes?: string) => Promise<boolean>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      currentShift: null,
      isAuthenticated: false,

      login: async (username, _password) => {
        try {
          const user = await db.users
            .where('username')
            .equals(username)
            .first();

          if (user && user.isActive) {
            // Check for open shift
            const openShift = await db.shifts
              .where('userId')
              .equals(user.id!)
              .filter((s) => s.status === 'open')
              .first();

            set({
              currentUser: user,
              currentShift: openShift || null,
              isAuthenticated: true,
            });

            // Audit log
            await db.auditLogs.add({
              userId: user.id,
              action: 'login',
              entity: 'users',
              entityId: user.id,
              timestamp: new Date(),
            });

            return true;
          }
          return false;
        } catch (error) {
          console.error('Login error:', error);
          return false;
        }
      },

      logout: async () => {
        const { currentUser } = get();
        
        if (currentUser) {
          await db.auditLogs.add({
            userId: currentUser.id,
            action: 'logout',
            entity: 'users',
            entityId: currentUser.id,
            timestamp: new Date(),
          });
        }

        set({
          currentUser: null,
          currentShift: null,
          isAuthenticated: false,
        });
      },

      openShift: async (openingCash) => {
        const { currentUser } = get();
        if (!currentUser) return false;

        try {
          const shiftId = await db.shifts.add({
            userId: currentUser.id!,
            openTime: new Date(),
            openingCash,
            status: 'open',
          });

          const shift = await db.shifts.get(shiftId);
          set({ currentShift: shift || null });

          await db.auditLogs.add({
            userId: currentUser.id,
            action: 'open_shift',
            entity: 'shifts',
            entityId: shiftId as number,
            timestamp: new Date(),
          });

          return true;
        } catch (error) {
          console.error('Open shift error:', error);
          return false;
        }
      },

      closeShift: async (closingCash, notes) => {
        const { currentUser, currentShift } = get();
        if (!currentUser || !currentShift) return false;

        try {
          // Calculate expected cash
          const shiftPayments = await db.payments
            .where('shiftId')
            .equals(currentShift.id!)
            .toArray();

          const cashIn = shiftPayments
            .filter((p) => p.direction === 'in' && p.method === 'cash')
            .reduce((sum, p) => sum + p.amount, 0);

          const cashOut = shiftPayments
            .filter((p) => p.direction === 'out' && p.method === 'cash')
            .reduce((sum, p) => sum + p.amount, 0);

          const expectedCash = currentShift.openingCash + cashIn - cashOut;
          const difference = closingCash - expectedCash;

          await db.shifts.update(currentShift.id!, {
            closeTime: new Date(),
            closingCash,
            expectedCash,
            difference,
            status: 'closed',
            notes,
          });

          set({ currentShift: null });

          await db.auditLogs.add({
            userId: currentUser.id,
            action: 'close_shift',
            entity: 'shifts',
            entityId: currentShift.id,
            timestamp: new Date(),
            meta: JSON.stringify({ closingCash, expectedCash, difference }),
          });

          return true;
        } catch (error) {
          console.error('Close shift error:', error);
          return false;
        }
      },
    }),
    {
      name: 'hoor-auth-store',
      partialize: (state) => ({
        currentUser: state.currentUser,
        currentShift: state.currentShift,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
