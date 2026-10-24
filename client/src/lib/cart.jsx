import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const Ctx = createContext(null);
const KEY = 'clinic.cart';
export const useCart = () => useContext(Ctx);

export const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const read = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
};

/** The bag lives in this browser until checkout. Prices shown here are re-checked by the server. */
export function CartProvider({ children }) {
  const [items, setItems] = useState(read);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* private mode */ }
  }, [items]);

  const add = useCallback((p, qty = 1) => {
    setItems((list) => {
      const found = list.find((i) => i.id === p.id);
      const max = Math.min(10, p.stock ?? 10);
      if (found) return list.map((i) => (i.id === p.id ? { ...i, qty: Math.min(max, i.qty + qty) } : i));
      return [...list, { id: p.id, slug: p.slug, name: p.name, brand: p.brand, size: p.size, price: p.price, image_url: p.image_url, category: p.category, stock: p.stock, qty: Math.min(max, qty) }];
    });
    setOpen(true);
  }, []);
  const setQty = useCallback((id, qty) => setItems((list) => list.map((i) => (i.id === id ? { ...i, qty: Math.max(1, Math.min(10, i.stock ?? 10, qty)) } : i))), []);
  const remove = useCallback((id) => setItems((list) => list.filter((i) => i.id !== id)), []);
  const clear = useCallback(() => setItems([]), []);

  const value = useMemo(() => ({
    items, add, setQty, remove, clear, open, setOpen,
    count: items.reduce((n, i) => n + i.qty, 0),
    subtotal: items.reduce((n, i) => n + i.qty * i.price, 0),
  }), [items, add, setQty, remove, clear, open]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
