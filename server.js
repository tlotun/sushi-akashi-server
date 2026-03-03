const express = require('express');
const fs = require('fs');
const path = require('path');
const net = require('net');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { createCanvas, registerFont } = require('canvas');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
const PRINTER_IP   = '192.168.1.222';
const PRINTER_PORT = 9100;
const RESTAURANT_NAME    = 'SUSHI AKASHI';
const RESTAURANT_NAME_JP = '鮨灯';
const TOTAL_TABLES = 10;
// ============================================================

// ── SSE clients (iPad / kitchen display) ──────────────────────
let sseClients = [];

function broadcastSSE(eventName, data) {
  const msg = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients = sseClients.filter(res => {
    try { res.write(msg); return true; }
    catch { return false; }
  });
}

// ── Multer ────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = './public/uploads';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `item-${Date.now()}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 5*1024*1024 },
  fileFilter: (req, file, cb) => file.mimetype.startsWith('image/') ? cb(null,true) : cb(new Error('Chỉ chấp nhận ảnh'))
});

let orders = [];
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── ESC/POS (Fix tiếng Việt CP1258) ───────────────────────────
const ESC = 0x1B, GS = 0x1D;

function escpos() {
  const cmds = [];

  const api = {
    init() {
      cmds.push(Buffer.from([ESC, 0x40])); // Initialize

      // Chọn codepage CP1258 (Vietnamese)
      cmds.push(Buffer.from([ESC, 0x74, 0x10]));

      return api;
    },

    cut() {
      cmds.push(Buffer.from([GS, 0x56, 0x41, 0x05]));
      return api;
    },

    feed(n = 3) {
      cmds.push(Buffer.from([ESC, 0x64, n]));
      return api;
    },

    bold(on) {
      cmds.push(Buffer.from([ESC, 0x45, on ? 1 : 0]));
      return api;
    },

    align(a) {
      cmds.push(Buffer.from([ESC, 0x61, a]));
      return api;
    },

    size(w, h) {
      cmds.push(Buffer.from([GS, 0x21, ((h - 1) << 4) | (w - 1)]));
      return api;
    },

    text(str) {
      cmds.push(Buffer.from(str + '\n', 'latin1')); // ⚠️ dùng latin1
      return api;
    },

    line(c = '-', l = 42) {
      cmds.push(Buffer.from(c.repeat(l) + '\n', 'latin1'));
      return api;
    },

    build() {
      return Buffer.concat(cmds);
    }
  };

  return api;
}

async function printOrder(order) {

  const width = 576; // 80mm
  const padding = 20;
  const lineHeight = 32;

  const now = new Date();
  const t = now.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'});
  const d = now.toLocaleDateString('vi-VN');
  const total = order.items.reduce((s,i)=>s+i.price*i.qty,0);

  const height = 1000;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = "#fff";
  ctx.fillRect(0,0,width,height);
  ctx.fillStyle = "#000";

  let y = 40;

  ctx.textAlign = "center";
  ctx.font = "bold 42px Arial";
  ctx.fillText(RESTAURANT_NAME, width/2, y);
  y += 50;

  ctx.font = "26px Arial";
  ctx.fillText("PHIẾU ĐẶT MÓN", width/2, y);
  y += 50;

  ctx.textAlign = "left";
  ctx.font = "24px Arial";

  ctx.fillText(`Bàn: ${order.table}`, padding, y); y+=lineHeight;
  ctx.fillText(`Giờ: ${t} ${d}`, padding, y); y+=lineHeight;
  ctx.fillText(`Mã: #${order.id.slice(-6).toUpperCase()}`, padding, y); y+=40;

  order.items.forEach(i=>{
    ctx.fillText(`${i.name} x${i.qty}`, padding, y);
    ctx.textAlign="right";
    ctx.fillText((i.price*i.qty).toLocaleString('vi-VN')+"đ", width-padding, y);
    ctx.textAlign="left";
    y+=lineHeight;
  });

  y+=20;
  ctx.fillText("TỔNG CỘNG:", padding, y);
  ctx.textAlign="right";
  ctx.fillText(total.toLocaleString('vi-VN')+"đ", width-padding, y);
  ctx.textAlign="left";
  y+=40;

  ctx.textAlign="center";
  ctx.fillText("Cảm ơn quý khách!", width/2, y);

  // Convert to monochrome bitmap
  const imgData = ctx.getImageData(0,0,width,y);
  const pixels = imgData.data;

  const bytesPerLine = width / 8;
  const bitmap = Buffer.alloc(bytesPerLine * y);

  for (let i = 0; i < y; i++) {
    for (let j = 0; j < width; j++) {

      const idx = (i * width + j) * 4;
      const r = pixels[idx];
      const g = pixels[idx+1];
      const b = pixels[idx+2];

      const gray = (r + g + b) / 3;
      const bit = gray < 128 ? 1 : 0;

      const byteIndex = i * bytesPerLine + (j >> 3);
      bitmap[byteIndex] |= bit << (7 - (j % 8));
    }
  }

  const header = Buffer.from([0x1B,0x40]); // init

  const rasterHeader = Buffer.from([
    0x1D,0x76,0x30,0x00,
    bytesPerLine & 0xFF,
    (bytesPerLine >> 8) & 0xFF,
    y & 0xFF,
    (y >> 8) & 0xFF
  ]);

  const cut = Buffer.from([0x1D,0x56,0x41,0x10]);

  const data = Buffer.concat([header, rasterHeader, bitmap, cut]);

  return new Promise((res,rej)=>{
    const s = new net.Socket();
    const to = setTimeout(()=>{s.destroy();rej(new Error('Timeout'));},5000);

    s.connect(PRINTER_PORT,PRINTER_IP,()=>{
      s.write(data,()=>{
        clearTimeout(to);
        s.end();
        res();
      });
    });

    s.on('error',e=>{
      clearTimeout(to);
      rej(e);
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════════════════════════

// ── SSE endpoint ──────────────────────────────────────────────
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type','text/event-stream');
  res.setHeader('Cache-Control','no-cache');
  res.setHeader('Connection','keep-alive');
  res.setHeader('Access-Control-Allow-Origin','*');
  res.flushHeaders();
  res.write('event: connected\ndata: {"ok":true}\n\n');
  sseClients.push(res);
  const hb = setInterval(()=>{ try{ res.write(':hb\n\n'); }catch{ clearInterval(hb); } }, 20000);
  req.on('close',()=>{ clearInterval(hb); sseClients=sseClients.filter(c=>c!==res); });
});

// ── MENU ──────────────────────────────────────────────────────
app.get('/api/menu', (req,res) => res.json(JSON.parse(fs.readFileSync('./data/menu.json','utf8'))));

// Category CRUD
app.post('/api/menu/category', (req,res) => {
  const menu=JSON.parse(fs.readFileSync('./data/menu.json','utf8'));
  const cat={ id: req.body.id || req.body.name.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,''), name:req.body.name, icon:req.body.icon||'🍽️' };
  if(menu.categories.find(c=>c.id===cat.id)) return res.status(400).json({error:'ID đã tồn tại'});
  menu.categories.push(cat);
  fs.writeFileSync('./data/menu.json',JSON.stringify(menu,null,2));
  res.json({success:true,category:cat});
});

app.put('/api/menu/category/:id', (req,res) => {
  const menu=JSON.parse(fs.readFileSync('./data/menu.json','utf8'));
  const idx=menu.categories.findIndex(c=>c.id===req.params.id);
  if(idx===-1) return res.status(404).json({error:'Không tìm thấy'});
  menu.categories[idx]={...menu.categories[idx],...req.body};
  fs.writeFileSync('./data/menu.json',JSON.stringify(menu,null,2));
  res.json({success:true});
});

app.delete('/api/menu/category/:id', (req,res) => {
  const menu=JSON.parse(fs.readFileSync('./data/menu.json','utf8'));
  const hasItems=menu.items.some(i=>i.category===req.params.id);
  if(hasItems) return res.status(400).json({error:'Vẫn còn món trong danh mục này. Hãy chuyển hoặc xoá các món trước.'});
  menu.categories=menu.categories.filter(c=>c.id!==req.params.id);
  fs.writeFileSync('./data/menu.json',JSON.stringify(menu,null,2));
  res.json({success:true});
});

// Menu item CRUD
app.post('/api/menu/item', upload.single('image'), (req,res) => {
  const menu=JSON.parse(fs.readFileSync('./data/menu.json','utf8'));
  const badges=req.body.badges?JSON.parse(req.body.badges):[];
  const pcs_options=req.body.pcs_options?JSON.parse(req.body.pcs_options):[];
  const item={ id:Date.now(), name:req.body.name, name_en:req.body.name_en||'', name_jp:req.body.name_jp||'', description:req.body.description||'', description_en:req.body.description_en||'', category:req.body.category, price:parseInt(req.body.price), available:true, badges, pcs_options, image:req.file?`/uploads/${req.file.filename}`:null };
  menu.items.push(item);
  fs.writeFileSync('./data/menu.json',JSON.stringify(menu,null,2));
  res.json({success:true,item});
});

app.put('/api/menu/item/:id', upload.single('image'), (req,res) => {
  const menu=JSON.parse(fs.readFileSync('./data/menu.json','utf8'));
  const idx=menu.items.findIndex(i=>i.id==req.params.id);
  if(idx===-1) return res.status(404).json({error:'Không tìm thấy'});
  const cur=menu.items[idx];
  const badges=req.body.badges?JSON.parse(req.body.badges):(cur.badges||[]);
  const pcs_options=req.body.pcs_options?JSON.parse(req.body.pcs_options):(cur.pcs_options||[]);
  const upd={ name:req.body.name||cur.name, name_en:req.body.name_en!==undefined?req.body.name_en:cur.name_en||'', name_jp:req.body.name_jp!==undefined?req.body.name_jp:cur.name_jp, description:req.body.description!==undefined?req.body.description:cur.description||'', description_en:req.body.description_en!==undefined?req.body.description_en:cur.description_en||'', category:req.body.category||cur.category, price:req.body.price?parseInt(req.body.price):cur.price, badges, pcs_options };
  if(req.body.description!==undefined) upd.description=req.body.description;
  if(req.body.available!==undefined) upd.available=req.body.available==='true'||req.body.available===true;
  if(req.file) upd.image=`/uploads/${req.file.filename}`;
  menu.items[idx]={...cur,...upd};
  fs.writeFileSync('./data/menu.json',JSON.stringify(menu,null,2));
  res.json({success:true,item:menu.items[idx]});
});

app.delete('/api/menu/item/:id', (req,res) => {
  const menu=JSON.parse(fs.readFileSync('./data/menu.json','utf8'));
  menu.items=menu.items.filter(i=>i.id!=req.params.id);
  fs.writeFileSync('./data/menu.json',JSON.stringify(menu,null,2));
  res.json({success:true});
});

// ── ORDERS ────────────────────────────────────────────────────
app.post('/api/order', async (req,res) => {
  const {table,items,note}=req.body;
  if(!table||!items||!items.length) return res.status(400).json({error:'Thiếu thông tin'});
  const order={ id:uuidv4(), table, items, note:note||'', status:'pending', createdAt:new Date().toISOString() };
  orders.push(order);
  console.log(`[ORDER] Bàn ${table} - ${items.length} món - ${new Date().toLocaleTimeString()}`);

  // Broadcast to SSE (iPad kitchen display)
  broadcastSSE('new_order', {
    id: order.id,
    shortId: order.id.slice(-6).toUpperCase(),
    table: order.table,
    items: order.items,
    note: order.note,
    createdAt: order.createdAt
  });

  try {
    await printOrder(order);
    order.printed=true;
    res.json({success:true,orderId:order.id});
  } catch(err) {
    order.printed=false;
    console.error(`[PRINT] ${err.message}`);
    res.json({success:true,orderId:order.id,printError:err.message});
  }
});

app.get('/api/orders', (req,res) => res.json(orders.slice().reverse()));
app.put('/api/orders/:id/status', (req,res) => {
  const o=orders.find(o=>o.id===req.params.id);
  if(!o) return res.status(404).json({error:'Not found'});
  o.status=req.body.status;
  if(req.body.status==='done') broadcastSSE('order_done',{id:o.id,table:o.table});
  res.json({success:true});
});
app.delete('/api/orders/:id', (req,res) => {
  orders=orders.filter(o=>o.id!==req.params.id);
  res.json({success:true});
});

// ── CONFIG (theme) ─────────────────────────────────────────────
const CONFIG_FILE = './data/config.json';
function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE,'utf8')); }
  catch { return { activeTheme: 'inkwash' }; }
}
app.get('/api/config', (req,res) => res.json(readConfig()));
app.put('/api/config', (req,res) => {
  const cfg = { ...readConfig(), ...req.body };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg,null,2));
  res.json({ success:true, config:cfg });
});

// ── QR ────────────────────────────────────────────────────────
app.get('/api/qr/:table', async (req,res) => {
  const ip = req.query.ip || req.hostname;
  const BASE_URL = "https://sushi-akashi.onrender.com";
const url = `${BASE_URL}/start?table=${req.params.table}`;
  const qr  = await QRCode.toDataURL(url,{width:300,margin:2,color:{dark:'#2c1810',light:'#ffffff'}});
  res.json({url,qr});
});
app.get('/api/qr-all', async (req,res) => {
  const ip=req.query.ip||req.hostname;
  const results=[];
  for(let i=1;i<=TOTAL_TABLES;i++){
    const url=`http://${ip}:${PORT}/start?table=${i}`;
    const qr=await QRCode.toDataURL(url,{width:200,margin:1});
    results.push({table:i,url,qr});
  }
  res.json(results);
});

// ── Pages ──────────────────────────────────────────────────────
app.get('/start',       (req,res) => res.sendFile(path.join(__dirname,'public','lang-select.html')));
app.get('/order',       (req,res) => res.sendFile(path.join(__dirname,'public','order.html')));
app.get('/order-snes',  (req,res) => res.sendFile(path.join(__dirname,'public','order-snes.html')));
app.get('/order-win95', (req,res) => res.sendFile(path.join(__dirname,'public','order-win95.html')));
app.get('/order-inkwash',(req,res) => res.sendFile(path.join(__dirname,'public','order-inkwash.html')));
app.get('/order-manga', (req,res) => res.sendFile(path.join(__dirname,'public','order-manga.html')));
app.get('/admin',       (req,res) => res.sendFile(path.join(__dirname,'public','admin.html')));
app.get('/kitchen',     (req,res) => res.sendFile(path.join(__dirname,'public','kitchen.html')));

app.listen(PORT,'0.0.0.0',()=>{
  console.log('\n🍣 ====================================');
  console.log('   SUSHI AKASHI 鮨灯 — v3.0');
  console.log(`✅ http://localhost:${PORT}`);
  console.log(`📋 Đặt món  : /order?table=1`);
  console.log(`⚙️  Admin    : /admin`);
  console.log(`📺 Kitchen  : /kitchen  ← iPad`);
  console.log(`🖨️  Máy in   : ${PRINTER_IP}:${PRINTER_PORT}`);
  console.log('=====================================\n');
});
