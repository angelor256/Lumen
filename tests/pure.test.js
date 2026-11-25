// Pruebas de la lógica pura (sin navegador): node tests/pure.test.js
const fs = require('fs'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/../app.js', 'utf8');
const L = new Function(src.slice(src.indexOf('// <PURE>'), src.indexOf('// </PURE>')) + ';return { classify, parseAmount, parseRelative, parseCred, sayLine };')();
const now = new Date(2026, 10, 25, 14, 3, 40); // miércoles 25 nov, 14:03
let n = 0; const t = (txt, f) => { const c = L.classify(txt, now); try { f(c); n++; } catch (e) { console.error('FALLA:', JSON.stringify(txt), '→', JSON.stringify(c)); throw e; } };

t('pagar luz ₡15.000 el 28', c => assert(c.kind === 'pay' && c.amount === 15000 && c.date === '2026-11-28'));
t('Pagar internet 30 mil el 15 cada mes', c => assert(c.kind === 'pay' && c.amount === 30000 && c.repeat === 'monthly'));
t('pago $5k de parqueo', c => assert(c.kind === 'pay' && c.amount === 5000));
t('Monto: 15,000 Comercio: Super Pepe', c => assert(c.kind === 'pay' && c.amount === 15000 && c.title === 'Pago a Super Pepe' && !c.paid));
t('Se realizó una transferencia SINPE Móvil por ₡25,000 a Juan Pérez. Detalle: almuerzo. Comprobante 20261125789',
  c => assert(c.kind === 'pay' && c.amount === 25000 && c.paid && /Juan Pérez/.test(c.title)));
t('Factura de Kölbi total: 18.500 vence el 30/11/2026', c => assert(c.kind === 'pay' && c.amount === 18500 && c.date === '2026-11-30' && !c.paid));
t('recordame llamar al banco en 20 min', c => assert(c.kind === 'remind' && c.time === '14:23' && c.date === '2026-11-25' && c.title === 'Llamar al banco'));
t('recordame comprar leche', c => assert(c.kind === 'remind' && c.time === '15:03' && c.defaulted === 'hour'));
t('hoy a las 6pm llamar a mamá', c => assert(c.kind === 'remind' && c.time === '18:00'));
t('mañana pasar por el paquete', c => assert(c.kind === 'remind' && c.date === '2026-11-26'));
t('el viernes cita con el dentista 3pm', c => assert(c.kind === 'remind' && c.type === 'appt' && c.date === '2026-11-27' && c.time === '15:00'));
t('netflix: ana@mail.com / Miclave123', c => assert(c.kind === 'cred' && c.svc === 'Netflix' && c.user === 'ana@mail.com' && c.pass === 'Miclave123'));
t('Banco Nacional\nUsuario: ana77\nContraseña: S3gura!2026', c => assert(c.kind === 'cred' && c.svc === 'Banco Nacional' && c.pass === 'S3gura!2026'));
t('clave del wifi 12345678', c => assert(c.kind === 'cred' && c.svc === 'Wifi' && c.pass === '12345678'));
t('contraseña de spotify: hola1234', c => assert(c.kind === 'cred' && c.svc === 'Spotify' && c.pass === 'hola1234'));
// lo que NO debe confundirse con una credencial ni con un pago
t('cambiar la clave del banco el viernes', c => assert(c.kind === 'remind'));
t('recordame renovar la contraseña del correo mañana', c => assert(c.kind === 'remind'));
t('comprar 3 manzanas', c => assert(c.kind === 'task' && c.date === '2026-11-25'));
t('Dentista: lunes / 3pm', c => assert(c.kind === 'remind' && c.title === 'Dentista'));
t('idea: app para mi mamá', c => assert(c.kind === 'note'));
assert.strictEqual(L.classify('   '), null); n++;
assert.strictEqual(L.parseAmount('2.5k').amount, 2500); n++;
assert.strictEqual(L.sayLine({ hour: 21, name: '', total: 3, done: 3, overdue: 0, nextTimed: null, nextPay: null, seed: 1 }).length > 0, true); n++;
console.log(`${n} comprobaciones correctas`);
