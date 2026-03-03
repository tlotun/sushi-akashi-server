// ─────────────────────────────────────────────────
// SHARED ORDER LOGIC — pcs cart management
// Cart key: `${itemId}__${pcs}` (double underscore)
// If no pcs_options → pcs = 0 (classic mode)
// ─────────────────────────────────────────────────

window.CART = {}; // { "id__pcs": { itemId, pcs, pcsLabel, price, qty } }

window.cartAdd = function(item, pcs, pcsLabel, price) {
  const key = `${item.id}__${pcs}`;
  if (!CART[key]) CART[key] = { itemId: item.id, item, pcs, pcsLabel, price, qty: 0 };
  CART[key].qty = Math.max(0, CART[key].qty + 1);
  if (!CART[key].qty) delete CART[key];
  return CART[key]?.qty || 0;
};

window.cartRemove = function(item, pcs) {
  const key = `${item.id}__${pcs}`;
  if (!CART[key]) return 0;
  CART[key].qty = Math.max(0, CART[key].qty - 1);
  if (!CART[key].qty) delete CART[key];
  return CART[key]?.qty || 0;
};

window.cartQty = function(itemId, pcs) {
  return CART[`${itemId}__${pcs}`]?.qty || 0;
};

window.cartItemTotal = function(itemId) {
  return Object.values(CART).filter(e => e.itemId == itemId).reduce((s,e) => s + e.qty, 0);
};

window.cartEntries = function() {
  return Object.values(CART).filter(e => e.qty > 0);
};

window.cartGrandTotal = function() {
  return cartEntries().reduce((s,e) => s + e.price * e.qty, 0);
};

window.cartCount = function() {
  return cartEntries().reduce((s,e) => s + e.qty, 0);
};

window.cartClear = function() {
  window.CART = {};
};

// For order submission — flatten to API format
window.cartToOrderItems = function(menuItems) {
  return cartEntries().map(e => ({
    id: e.itemId,
    name: e.item.name + (e.pcs ? ` [${e.pcsLabel || e.pcs+'pcs'}]` : ''),
    price: e.price,
    qty: e.qty,
    pcs: e.pcs || null
  }));
};
