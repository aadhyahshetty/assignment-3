// server.js — FINAL (Express + Supabase)
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const PORT = process.env.PORT || 5000;

// ---- Supabase config ----
// Uses env vars if provided; otherwise falls back to your project values so it runs out-of-the-box.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vdnoqcextmpharopzmxe.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkbm9xY2V4dG1waGFyb3B6bXhlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjM5ODMyOSwiZXhwIjoyMDcxOTc0MzI5fQ.oKP92hxbZ-IYQx6qSNxvkkERFbSodcKWZwwzWK2Mw3E';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase URL or Service Role key');
  process.exit(1);
}

// Admin client (server-only). DO NOT expose this key on frontend.
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const app = express();

// CORS configuration - more specific for better compatibility
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173', 'http://localhost:8080', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - Origin: ${req.headers.origin || 'unknown'}`);
  next();
});

// ---------- Utils ----------
async function getOrCreateCart(user_id) {
  let { data: carts, error: cartErr } = await supabase
    .from('carts')
    .select('*')
    .eq('user_id', user_id)
    .limit(1);

  if (cartErr) throw cartErr;
  if (carts && carts.length) return carts[0];

  const { data: newCart, error: newCartErr } = await supabase
    .from('carts')
    .insert([{ user_id }])
    .select()
    .single();
  if (newCartErr) throw newCartErr;
  return newCart;
}

// ---------- Health & Debug ----------
app.get('/api/health', (req, res) => {
  res.json({ 
    ok: true, 
    supabaseUrl: SUPABASE_URL,
    timestamp: new Date().toISOString(),
    port: PORT,
    cors: 'enabled'
  });
});

// Debug endpoint to test CORS
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'Backend is working!',
    headers: req.headers,
    method: req.method,
    url: req.url
  });
});

// Preflight handler for CORS
app.options('*', cors());

// ---------- Products ----------
app.get('/api/products', async (req, res) => {
  try {
    const { search, category, sort = 'name', order = 'asc', page = 1, limit = 20 } = req.query;
    let query = supabase.from('products').select('*');

    if (search) query = query.ilike('name', `%${search}%`);
    if (category) query = query.eq('category', category);

    const pageNum = Math.max(parseInt(page) || 1, 1);
    const pageSize = Math.min(parseInt(limit) || 20, 100);
    const from = (pageNum - 1) * pageSize;
    const to = from + pageSize - 1;

    query = query.order(sort, { ascending: order === 'asc' }).range(from, to);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { data, error } = await supabase.from('products').select('*').eq('id', id).single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

// ---------- Users (helper: list) ----------
app.get('/api/users', async (req, res) => {
  try {
    const { data, error } = await supabase.from('users').select('id, email, name').limit(100);
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Cart ----------
// Get cart (with product details)
app.get('/api/cart/:user_id', async (req, res) => {
  try {
    const user_id = req.params.user_id;
    const cart = await getOrCreateCart(user_id);

    const { data, error } = await supabase
      .from('cart_items')
      .select('id, quantity, product_id, product:products(id, name, description, price, stock, created_at)')
      .eq('cart_id', cart.id);

    if (error) throw error;
    res.json({ cart_id: cart.id, items: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Add to cart
app.post('/api/cart/add', async (req, res) => {
  try {
    const { user_id, product_id, quantity = 1 } = req.body;
    if (!user_id || !product_id) return res.status(400).json({ error: 'user_id and product_id are required' });

    const cart = await getOrCreateCart(user_id);

    const { data: existing, error: existErr } = await supabase
      .from('cart_items')
      .select('*')
      .eq('cart_id', cart.id)
      .eq('product_id', product_id)
      .limit(1);
    if (existErr) throw existErr;

    if (existing && existing.length) {
      const item = existing[0];
      const newQty = (item.quantity || 1) + (quantity || 1);
      const { data, error } = await supabase
        .from('cart_items')
        .update({ quantity: newQty })
        .eq('id', item.id)
        .select()
        .single();
      if (error) throw error;
      return res.json(data);
    } else {
      const { data, error } = await supabase
        .from('cart_items')
        .insert([{ cart_id: cart.id, product_id, quantity }])
        .select()
        .single();
      if (error) throw error;
      return res.json(data);
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update cart quantity
app.put('/api/cart/update', async (req, res) => {
  try {
    const { cart_item_id, quantity } = req.body;
    if (!cart_item_id || typeof quantity !== 'number') {
      return res.status(400).json({ error: 'cart_item_id and numeric quantity required' });
    }
    const { data, error } = await supabase
      .from('cart_items')
      .update({ quantity })
      .eq('id', cart_item_id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Remove cart item
app.delete('/api/cart/remove/:cart_item_id', async (req, res) => {
  try {
    const id = req.params.cart_item_id;
    const { error } = await supabase.from('cart_items').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Cart summary
app.get('/api/cart-summary/:user_id', async (req, res) => {
  try {
    const user_id = req.params.user_id;
    const cart = await getOrCreateCart(user_id);
    const { data: items, error } = await supabase
      .from('cart_items')
      .select('quantity, product:products(id, name, price)')
      .eq('cart_id', cart.id);
    if (error) throw error;

    const subtotal = (items || []).reduce((sum, it) => sum + (it.product?.price || 0) * (it.quantity || 1), 0);
    const tax = +(subtotal * 0.1).toFixed(2);
    const total = +(subtotal + tax).toFixed(2);
    res.json({ cart_id: cart.id, subtotal, tax, total });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Checkout (simulation) ----------
app.post('/api/checkout', async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    const cart = await getOrCreateCart(user_id);

    const { data: items, error: itemsErr } = await supabase
      .from('cart_items')
      .select('id, quantity, product_id, product:products(price)')
      .eq('cart_id', cart.id);
    if (itemsErr) throw itemsErr;

    const subtotal = (items || []).reduce((s, it) => s + (it.product?.price || 0) * (it.quantity || 1), 0);
    const tax = +(subtotal * 0.1).toFixed(2);
    const total = +(subtotal + tax).toFixed(2);

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert([{ user_id, total }])
      .select()
      .single();
    if (orderErr) throw orderErr;

    const orderItems = (items || []).map(it => ({ order_id: order.id, product_id: it.product_id, quantity: it.quantity, price: it.product?.price || 0 }));
    if (orderItems.length) {
      const { error: oiErr } = await supabase.from('order_items').insert(orderItems);
      if (oiErr) throw oiErr;
    }

    const { error: clearErr } = await supabase.from('cart_items').delete().eq('cart_id', cart.id);
    if (clearErr) throw clearErr;

    res.json({ success: true, order_id: order.id, total });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ---------- Dev seed (idempotent) ----------
app.post('/api/dev/seed', async (req, res) => {
  try {
    const users = [
      { email: 'harry@hogwarts.com', name: 'Harry Potter', password: 'password123' },
      { email: 'hermione@hogwarts.com', name: 'Hermione Granger', password: 'password123' },
      { email: 'ron@hogwarts.com', name: 'Ron Weasley', password: 'password123' },
    ];
    for (const u of users) {
      const { data: exists, error } = await supabase.from('users').select('id').eq('email', u.email).limit(1);
      if (error) throw error;
      if (!exists || !exists.length) { await supabase.from('users').insert([u]); }
    }

    const products = [
      { name: 'Elder Wand', description: 'The most powerful wand ever made.', price: 999.99, image: 'https://i.pinimg.com/736x/8d/58/f8/elderwand.jpg', category: 'Wands' },
      { name: 'Polyjuice Potion', description: 'Transforms you into someone else for an hour.', price: 499.00, image: 'https://i.pinimg.com/736x/42/f3/potion.jpg', category: 'Potions' },
      { name: 'Expelliarmus Spell', description: 'Disarms your opponent instantly.', price: 150.00, image: 'https://i.pinimg.com/736x/7b/21/spell.jpg', category: 'Spells' },
      { name: 'Crystal Ball', description: 'See visions of the future.', price: 350.00, image: 'https://i.pinimg.com/736x/1c/42/crystal.jpg', category: 'Artifacts' },
      { name: 'Invisibility Cloak', description: 'Grants the wearer true invisibility.', price: 1200.00, image: 'https://i.pinimg.com/736x/11/22/cloak.jpg', category: 'Artifacts' },
    ];
    for (const p of products) {
      const { data: exists, error } = await supabase.from('products').select('id').eq('name', p.name).limit(1);
      if (error) throw error;
      if (!exists || !exists.length) { await supabase.from('products').insert([p]); }
    }

    const { data: userList } = await supabase.from('users').select('id');
    for (const u of (userList || [])) {
      const { data: carts, error } = await supabase.from('carts').select('id').eq('user_id', u.id).limit(1);
      if (error) throw error;
      if (!carts || !carts.length) { await supabase.from('carts').insert([{ user_id: u.id }]); }
    }

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
