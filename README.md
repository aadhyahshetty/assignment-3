# be_final — Express + Supabase (FINAL)

## Run
```bash
npm install
npm start
```
Server: http://localhost:5000

## Endpoints
- GET /api/health
- GET /api/products
- GET /api/products/:id
- GET /api/users
- GET /api/cart/:user_id
- GET /api/cart-summary/:user_id
- POST /api/cart/add           { user_id, product_id, quantity }
- PUT  /api/cart/update        { cart_item_id, quantity }
- DELETE /api/cart/remove/:cart_item_id
- POST /api/checkout           { user_id }

### Dev
- POST /api/dev/seed   (idempotent)
