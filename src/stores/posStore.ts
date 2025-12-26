import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CartItem, Cart, Customer, Variant, Model, HoldInvoice } from '@/types';
import { db, generateInvoiceNumber } from '@/db';

interface POSState {
  // Cart
  cart: Cart;
  holdInvoices: HoldInvoice[];
  
  // Actions
  addToCart: (variant: Variant, model: Model, qty?: number) => void;
  updateCartItem: (variantId: number, updates: Partial<CartItem>) => void;
  removeFromCart: (variantId: number) => void;
  clearCart: () => void;
  setCustomer: (customer: Customer | null) => void;
  setCartDiscount: (amount: number, isPercent?: boolean) => void;
  
  // Hold
  holdCart: (note?: string) => void;
  recallHold: (holdId: string) => void;
  deleteHold: (holdId: string) => void;
  
  // Checkout
  checkout: (paymentMethod: string, paidAmount: number) => Promise<number | null>;
  
  // Helpers
  recalculateCart: () => void;
}

const emptyCart: Cart = {
  items: [],
  subtotal: 0,
  discountAmount: 0,
  discountPercent: 0,
  taxAmount: 0,
  total: 0,
};

export const usePOSStore = create<POSState>()(
  persist(
    (set, get) => ({
      cart: { ...emptyCart },
      holdInvoices: [],

      addToCart: (variant, model, qty = 1) => {
        set((state) => {
          const existingIndex = state.cart.items.findIndex(
            (item) => item.variantId === variant.id
          );

          let newItems: CartItem[];

          if (existingIndex >= 0) {
            newItems = state.cart.items.map((item, index) =>
              index === existingIndex
                ? {
                    ...item,
                    qty: item.qty + qty,
                    lineTotal: (item.qty + qty) * item.price - item.discountAmount,
                  }
                : item
            );
          } else {
            const newItem: CartItem = {
              variantId: variant.id!,
              variant,
              model,
              qty,
              price: variant.salePrice,
              discountAmount: 0,
              discountPercent: 0,
              lineTotal: qty * variant.salePrice,
            };
            newItems = [...state.cart.items, newItem];
          }

          const subtotal = newItems.reduce((sum, item) => sum + item.lineTotal, 0);
          const discountAmount = state.cart.discountPercent > 0
            ? subtotal * (state.cart.discountPercent / 100)
            : state.cart.discountAmount;
          const total = subtotal - discountAmount;

          return {
            cart: {
              ...state.cart,
              items: newItems,
              subtotal,
              discountAmount,
              total,
            },
          };
        });
      },

      updateCartItem: (variantId, updates) => {
        set((state) => {
          const newItems = state.cart.items.map((item) => {
            if (item.variantId === variantId) {
              const updated = { ...item, ...updates };
              updated.lineTotal = updated.qty * updated.price - updated.discountAmount;
              return updated;
            }
            return item;
          });

          const subtotal = newItems.reduce((sum, item) => sum + item.lineTotal, 0);
          const discountAmount = state.cart.discountPercent > 0
            ? subtotal * (state.cart.discountPercent / 100)
            : state.cart.discountAmount;
          const total = subtotal - discountAmount;

          return {
            cart: {
              ...state.cart,
              items: newItems,
              subtotal,
              discountAmount,
              total,
            },
          };
        });
      },

      removeFromCart: (variantId) => {
        set((state) => {
          const newItems = state.cart.items.filter(
            (item) => item.variantId !== variantId
          );

          const subtotal = newItems.reduce((sum, item) => sum + item.lineTotal, 0);
          const discountAmount = state.cart.discountPercent > 0
            ? subtotal * (state.cart.discountPercent / 100)
            : state.cart.discountAmount;
          const total = subtotal - discountAmount;

          return {
            cart: {
              ...state.cart,
              items: newItems,
              subtotal,
              discountAmount,
              total,
            },
          };
        });
      },

      clearCart: () => {
        set({ cart: { ...emptyCart } });
      },

      setCustomer: (customer) => {
        set((state) => ({
          cart: {
            ...state.cart,
            customerId: customer?.id,
            customer: customer || undefined,
          },
        }));
      },

      setCartDiscount: (amount, isPercent = false) => {
        set((state) => {
          const discountPercent = isPercent ? amount : 0;
          const discountAmount = isPercent
            ? state.cart.subtotal * (amount / 100)
            : amount;
          const total = state.cart.subtotal - discountAmount;

          return {
            cart: {
              ...state.cart,
              discountAmount,
              discountPercent,
              total,
            },
          };
        });
      },

      holdCart: (note) => {
        const { cart, holdInvoices } = get();
        if (cart.items.length === 0) return;

        const holdInvoice: HoldInvoice = {
          id: Date.now().toString(),
          cart: { ...cart },
          holdTime: new Date(),
          note,
        };

        set({
          holdInvoices: [...holdInvoices, holdInvoice],
          cart: { ...emptyCart },
        });
      },

      recallHold: (holdId) => {
        const { holdInvoices } = get();
        const hold = holdInvoices.find((h) => h.id === holdId);
        if (!hold) return;

        set({
          cart: { ...hold.cart },
          holdInvoices: holdInvoices.filter((h) => h.id !== holdId),
        });
      },

      deleteHold: (holdId) => {
        set((state) => ({
          holdInvoices: state.holdInvoices.filter((h) => h.id !== holdId),
        }));
      },

      checkout: async (paymentMethod, paidAmount) => {
        const { cart, clearCart } = get();
        if (cart.items.length === 0) return null;

        try {
          // Generate invoice number
          const invoiceNumber = await generateInvoiceNumber('INV');

          // Determine payment status
          let paymentStatus: 'paid' | 'unpaid' | 'partial' = 'paid';
          if (paidAmount === 0) {
            paymentStatus = 'unpaid';
          } else if (paidAmount < cart.total) {
            paymentStatus = 'partial';
          }

          // Create sales invoice
          const invoiceId = await db.salesInvoices.add({
            invoiceNumber,
            date: new Date(),
            customerId: cart.customerId,
            subtotal: cart.subtotal,
            discountAmount: cart.discountAmount,
            discountPercent: cart.discountPercent,
            taxAmount: cart.taxAmount,
            total: cart.total,
            paidAmount,
            paymentStatus,
            status: 'confirmed',
          });

          // Add sales items and stock moves
          for (const item of cart.items) {
            await db.salesItems.add({
              invoiceId: invoiceId as number,
              variantId: item.variantId,
              qty: item.qty,
              price: item.price,
              discountAmount: item.discountAmount,
              discountPercent: item.discountPercent,
              lineTotal: item.lineTotal,
              unitCostSnapshot: item.variant?.costPrice || 0,
            });

            // Stock out
            await db.stockMoves.add({
              date: new Date(),
              variantId: item.variantId,
              qtyIn: 0,
              qtyOut: item.qty,
              unitCost: item.variant?.costPrice || 0,
              refType: 'sale',
              refId: invoiceId as number,
            });
          }

          // Add payment record
          if (paidAmount > 0) {
            await db.payments.add({
              date: new Date(),
              direction: 'in',
              method: paymentMethod as 'cash' | 'card' | 'transfer' | 'credit',
              amount: paidAmount,
              customerId: cart.customerId,
              refType: 'sale',
              refId: invoiceId as number,
            });
          }

          // Update customer balance if credit sale
          if (cart.customerId && paymentStatus !== 'paid') {
            const customer = await db.customers.get(cart.customerId);
            if (customer) {
              await db.customers.update(cart.customerId, {
                currentBalance: customer.currentBalance + (cart.total - paidAmount),
              });
            }
          }

          clearCart();
          return invoiceId as number;
        } catch (error) {
          console.error('Checkout error:', error);
          return null;
        }
      },

      recalculateCart: () => {
        set((state) => {
          const subtotal = state.cart.items.reduce(
            (sum, item) => sum + item.lineTotal,
            0
          );
          const discountAmount = state.cart.discountPercent > 0
            ? subtotal * (state.cart.discountPercent / 100)
            : state.cart.discountAmount;
          const total = subtotal - discountAmount;

          return {
            cart: {
              ...state.cart,
              subtotal,
              discountAmount,
              total,
            },
          };
        });
      },
    }),
    {
      name: 'hoor-pos-store',
      partialize: (state) => ({
        cart: state.cart,
        holdInvoices: state.holdInvoices,
      }),
    }
  )
);
