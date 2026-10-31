// سيرفر الوساطة للعبة Shooter Game
// الدور: كيوصل بين لاعبين باش يتبادلو معلومات الاتصال (signaling)
// اللعب نفسو كيبقى مباشر P2P بين الجهازين — السيرفر غير وسيط البداية

const WebSocket = require('ws');
const PORT = process.env.PORT || 3000;

// الغرف: code -> { host, guest }
const rooms = new Map();

// كود قصير من 6 أرقام
function makeCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

const wss = new WebSocket.Server({ port: PORT });
console.log('🎮 Signaling server running on port ' + PORT);

wss.on('connection', (ws) => {
  let myCode = null;
  let myRole = null; // 'host' أو 'guest'

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (e) {
      return; // رسالة غير صالحة — تجاهل
    }

    // 1) اللاعب 1: إنشاء غرفة
    if (msg.type === 'create') {
      let code;
      do {
        code = makeCode();
      } while (rooms.has(code));
      rooms.set(code, { host: ws, guest: null });
      myCode = code;
      myRole = 'host';
      ws.send(JSON.stringify({ type: 'created', code: code }));
      console.log('✅ Room created: ' + code);
    }

    // 2) اللاعب 2: الدخول بكود
    else if (msg.type === 'join') {
      const code = String(msg.code || '').trim();
      const room = rooms.get(code);
      if (!room) {
        ws.send(JSON.stringify({ type: 'error', message: 'الكود غير موجود — تأكد من الأرقام' }));
        return;
      }
      if (room.guest) {
        ws.send(JSON.stringify({ type: 'error', message: 'الغرفة عامرة — كاين جوج لاعبين ديجا' }));
        return;
      }
      room.guest = ws;
      myCode = code;
      myRole = 'guest';
      ws.send(JSON.stringify({ type: 'joined', code: code }));
      if (room.host.readyState === WebSocket.OPEN) {
        room.host.send(JSON.stringify({ type: 'guest-joined' }));
      }
      console.log('✅ Guest joined room: ' + code);
    }

    // 3) تمرير معلومات الاتصال (offer/answer/ICE) للطرف الآخر
    else if (msg.type === 'signal') {
      const room = rooms.get(myCode);
      if (!room) return;
      const other = myRole === 'host' ? room.guest : room.host;
      if (other && other.readyState === WebSocket.OPEN) {
        other.send(JSON.stringify({ type: 'signal', data: msg.data }));
      }
    }
  });

  // تنظيف الغرفة مني يخرج شي لاعب
  ws.on('close', () => {
    if (myCode && rooms.has(myCode)) {
      const room = rooms.get(myCode);
      const other = myRole === 'host' ? room.guest : room.host;
      if (other && other.readyState === WebSocket.OPEN) {
        try {
          other.send(JSON.stringify({ type: 'peer-left', message: 'الصاحب خرج من الغرفة' }));
        } catch (e) {}
      }
      rooms.delete(myCode);
      console.log('🗑️ Room closed: ' + myCode);
    }
  });

  ws.on('error', () => {});
});
