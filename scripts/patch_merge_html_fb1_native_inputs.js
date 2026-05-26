/**
 * Rewrites 申报表单合并导航.html sec-fb1 (附列资料一): replaces Vue div-based
 * money cells with native <input class="merged-native merged-native-money"> like sec-main.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INPUT_PATH = path.join(ROOT, '申报表单合并导航.html');

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function findCloseDiv(html, innerStart) {
  let depth = 1;
  let i = innerStart;
  while (depth > 0 && i < html.length) {
    const nd = html.indexOf('<div', i);
    const nc = html.indexOf('</div>', i);
    if (nc === -1) throw new Error('unbalanced div');
    if (nd !== -1 && nd < nc) {
      depth += 1;
      i = nd + 4;
    } else {
      depth -= 1;
      i = nc + 6;
    }
  }
  return i;
}

function patchFb1(html) {
  const endMarker = 'id="sec-fb2"';
  const startNeedle = 'id="sec-fb1"';
  const a = html.indexOf(startNeedle);
  const b = html.indexOf(endMarker);
  if (a === -1 || b === -1) throw new Error('sec-fb1 / sec-fb2 markers not found');

  const head = html.slice(0, a);
  let fb1 = html.slice(a, b);
  const tail = html.slice(b);

  const openRe =
    /<div data-v-a5cc4dd6[^>]*class="edit-select-input edit-input-money sygv-editable-table-input-money"[^>]*>/g;

  const replacements = [];
  let m;
  let num = 0;
  while ((m = openRe.exec(fb1)) !== null) {
    const openTag = m[0];
    const openStart = m.index;
    const innerStart = openStart + openTag.length;
    const closeEnd = findCloseDiv(fb1, innerStart);
    const nameMatch = /name="([^"]*)"/.exec(openTag);
    const vtMatch = /valuetext=([^\s>]+)/.exec(openTag);
    const name = nameMatch ? nameMatch[1] : '';
    const display = vtMatch ? vtMatch[1] : '';
    const input = `<input class="merged-native merged-native-money" type="text" inputmode="decimal" autocomplete="off" id="sec-fb1-num-${++num}" name="${escapeAttr(name)}" value="${escapeAttr(display)}" title="${escapeAttr(name)}" aria-label="${escapeAttr(name)}" />`;
    replacements.push({ openStart, closeEnd, input });
    openRe.lastIndex = closeEnd;
  }

  replacements.sort((x, y) => y.openStart - x.openStart);
  for (const r of replacements) {
    fb1 = fb1.slice(0, r.openStart) + r.input + fb1.slice(r.closeEnd);
  }

  console.log('Replaced', replacements.length, 'money widgets in sec-fb1');
  return head + fb1 + tail;
}

const html = fs.readFileSync(INPUT_PATH, 'utf8');
const out = patchFb1(html);
fs.writeFileSync(INPUT_PATH, out, 'utf8');
