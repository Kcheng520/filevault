/* =====================================================
   FileVault — 无需登录版本
   任何人打开即可上传文件、生成分享链接
   ===================================================== */

const SUPABASE_URL = 'https://fmpodwoollkegsvucect.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtcG9kd29vbGxrZWdzdnVjZWN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5NzI3OTgsImV4cCI6MjA5NjU0ODc5OH0.J5oKcTyzZyk8bUF2PKkuhfwcnEx42MFyu1CYCKQEeME';

// ── Supabase REST 客户端 ───────────────────────────────
const SB = { url: SUPABASE_URL, key: SUPABASE_KEY };

function sbHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    'apikey': SB.key,
    'Authorization': 'Bearer ' + SB.key,
    ...extra
  };
}

async function dbSelect(table, params = '') {
  const r = await fetch(`${SB.url}/rest/v1/${table}?${params}`, {
    headers: { ...sbHeaders(), 'Prefer': 'return=representation' }
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function dbInsert(table, body) {
  const r = await fetch(`${SB.url}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...sbHeaders(), 'Prefer': 'return=representation' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function dbDelete(table, params) {
  const r = await fetch(`${SB.url}/rest/v1/${table}?${params}`, {
    method: 'DELETE',
    headers: sbHeaders()
  });
  if (!r.ok) throw new Error(await r.text());
}

async function storageUpload(path, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${SB.url}/storage/v1/object/files/${path}`);
    xhr.setRequestHeader('apikey', SB.key);
    xhr.setRequestHeader('Authorization', 'Bearer ' + SB.key);
    xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(xhr.responseText));
    xhr.onerror = () => reject(new Error('上传失败'));
    xhr.send(file);
  });
}

async function storageSignedUrl(path, expiresIn = 3600) {
  const r = await fetch(`${SB.url}/storage/v1/object/sign/files/${path}`, {
    method: 'POST',
    headers: sbHeaders(),
    body: JSON.stringify({ expiresIn })
  });
  if (!r.ok) throw new Error(await r.text());
  const data = await r.json();
  return `${SB.url}/storage/v1${data.signedURL}`;
}

async function storageDelete(path) {
  await fetch(`${SB.url}/storage/v1/object/files/${path}`, {
    method: 'DELETE',
    headers: sbHeaders()
  });
}

// ══════════════════════════════════════════════════════
// 工具函数
// ══════════════════════════════════════════════════════
function el(id) { return document.getElementById(id); }
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function uid(len = 12) {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({length: len}, () => c[Math.random() * c.length | 0]).join('');
}
function randomPassword() { return uid(8); }
function simpleHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i);
  return (h >>> 0).toString(16);
}
function fileEmoji(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const m = {pdf:'📄',doc:'📝',docx:'📝',xls:'📊',xlsx:'📊',ppt:'📋',pptx:'📋',
    txt:'📃',md:'📃',jpg:'🖼',jpeg:'🖼',png:'🖼',gif:'🖼',webp:'🖼',svg:'🖼',
    mp4:'🎬',mov:'🎬',avi:'🎬',mkv:'🎬',mp3:'🎵',wav:'🎵',flac:'🎵',
    zip:'🗜',rar:'🗜','7z':'🗜',gz:'🗜',html:'🌐',css:'🎨',js:'⚡',
    ts:'⚡',json:'🔧',py:'🐍',go:'🔵',rs:'🦀',java:'☕'};
  return m[ext] || '📦';
}
function formatSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}
function formatDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('zh-CN', {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
}
function showErr(el, msg) { el.textContent = msg; el.style.display = 'block'; }
function buildShareLink(shareId) {
  return window.location.href.split('?')[0] + '?share=' + shareId;
}
function getShareIdFromURL() {
  return new URLSearchParams(window.location.search).get('share');
}

// ══════════════════════════════════════════════════════
// 页面路由
// ══════════════════════════════════════════════════════
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pg = el('page-' + name);
  if (pg) pg.classList.add('active');
  if (name === 'main') initMain();
  if (name === 'share') initSharePage();
  window.scrollTo(0, 0);
}

// ══════════════════════════════════════════════════════
// 主页面（上传 + 文件列表 + 分享列表）
// ══════════════════════════════════════════════════════
function initMain() {
  renderFileList();
  renderShareList();
}

function switchTab(name, linkEl) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
  el('tab-' + name).classList.add('active');
  if (linkEl) linkEl.classList.add('active');
  if (name === 'files')  renderFileList();
  if (name === 'shared') renderShareList();
}

// ── 文件列表 ───────────────────────────────────────────
async function renderFileList() {
  const container = el('file-list');
  container.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>加载中...</p></div>`;
  try {
    const files = await dbSelect('files', 'select=id,name,size,created_at,storage_path&order=created_at.desc');
    if (!files.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">📂</div><p>还没有文件，<a href="#" onclick="switchTab('upload',document.querySelector('[data-tab=upload]'))">立即上传</a></p></div>`;
      return;
    }
    container.innerHTML = files.map(f => `
      <div class="file-item">
        <div class="file-thumb">${fileEmoji(f.name)}</div>
        <div class="file-info">
          <div class="file-name">${esc(f.name)}</div>
          <div class="file-meta">${formatSize(f.size)} · ${formatDate(f.created_at)}</div>
        </div>
        <div class="file-actions">
          <button class="btn btn-sm btn-ghost" onclick="downloadFile('${esc(f.storage_path)}','${esc(f.name)}',this)">⬇ 下载</button>
          <button class="btn btn-sm btn-ghost" onclick="createShareForFile('${f.id}','${esc(f.name)}',${f.size})">🔗 分享</button>
          <button class="btn btn-sm btn-danger" onclick="deleteFile('${f.id}','${esc(f.storage_path)}')">删除</button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><p style="color:var(--danger)">加载失败：${esc(e.message)}</p></div>`;
  }
}

async function deleteFile(fileId, storagePath) {
  if (!confirm('确定删除此文件？相关分享链接也将失效。')) return;
  try {
    await dbDelete('files', `id=eq.${fileId}`);
    await storageDelete(storagePath);
    renderFileList();
    renderShareList();
  } catch (e) { alert('删除失败：' + e.message); }
}

async function downloadFile(storagePath, fileName, btn) {
  const orig = btn.textContent;
  btn.textContent = '⏳ 下载中...';
  btn.disabled = true;
  try {
    const signedUrl = await storageSignedUrl(storagePath, 3600);
    // 加 download 参数让 Supabase 返回 Content-Disposition: attachment
    const dlUrl = signedUrl + '&download=' + encodeURIComponent(fileName);
    const a = document.createElement('a');
    a.href = dlUrl;
    a.download = fileName;
    a.target = '_blank';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  } catch (e) { alert('下载失败：' + e.message); }
  btn.textContent = orig;
  btn.disabled = false;
}

// ── 分享列表 ───────────────────────────────────────────
async function renderShareList() {
  const container = el('share-list');
  container.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>加载中...</p></div>`;
  try {
    const shares = await dbSelect('shares', 'select=*&order=created_at.desc');
    if (!shares.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">🔗</div><p>还没有分享链接</p></div>`;
      return;
    }
    const now = Date.now();
    container.innerHTML = shares.map(s => {
      const isExpired = s.expires_at && new Date(s.expires_at).getTime() < now;
      const link = buildShareLink(s.id);
      return `
        <div class="share-item">
          <div class="share-item-header">
            <div class="share-item-name">${esc(s.file_name)}</div>
            <div class="share-item-badges">
              ${isExpired ? '<span class="badge badge-expired">已过期</span>' : '<span class="badge badge-active">有效</span>'}
              ${s.password_hash ? '<span class="badge badge-lock">🔒 有密码</span>' : ''}
            </div>
          </div>
          <div class="share-link-row">
            <span class="share-link-url">${link}</span>
            <button class="btn btn-sm btn-ghost" onclick="copyText('${link}',this)">复制链接</button>
            <button class="btn btn-sm btn-danger" onclick="deleteShare('${s.id}')">删除</button>
          </div>
          ${s.expires_at ? `<div style="font-size:12px;color:var(--text-muted);margin-top:6px">过期：${formatDate(s.expires_at)}</div>` : ''}
        </div>
      `;
    }).join('');
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><p style="color:var(--danger)">加载失败：${esc(e.message)}</p></div>`;
  }
}

async function deleteShare(shareId) {
  try { await dbDelete('shares', `id=eq.${shareId}`); renderShareList(); }
  catch (e) { alert('删除失败：' + e.message); }
}

async function createShareForFile(fileId, fileName, fileSize) {
  const existing = await dbSelect('shares', `file_id=eq.${fileId}&order=created_at.desc&limit=1`).catch(() => []);
  if (existing.length) { showShareModal(existing[0], ''); return; }
  try {
    const rows = await dbInsert('shares', {
      id: uid(12), file_id: fileId, file_name: fileName,
      file_size: fileSize, password_hash: null, expires_at: null
    });
    showShareModal(rows[0], '');
    renderShareList();
  } catch (e) { alert('创建分享失败：' + e.message); }
}

// ══════════════════════════════════════════════════════
// 上传
// ══════════════════════════════════════════════════════
let pendingFiles = [];

function handleFiles(fileList) { pendingFiles = [...fileList]; renderQueue(); }
function dragOver(e) { e.preventDefault(); el('upload-area').classList.add('drag-over'); }
function dragLeave()  { el('upload-area').classList.remove('drag-over'); }
function dropFile(e)  { e.preventDefault(); dragLeave(); handleFiles(e.dataTransfer.files); }

function renderQueue() {
  if (!pendingFiles.length) { el('upload-queue').style.display = 'none'; return; }
  el('upload-queue').style.display = 'block';
  el('queue-list').innerHTML = pendingFiles.map((f, i) => `
    <div class="queue-item">
      <span class="queue-file-icon">${fileEmoji(f.name)}</span>
      <div class="queue-info">
        <div class="queue-name">${esc(f.name)}</div>
        <div class="queue-size">${formatSize(f.size)}</div>
      </div>
      <span class="queue-remove" onclick="removeFromQueue(${i})">✕</span>
    </div>
  `).join('');
}

function removeFromQueue(i) { pendingFiles.splice(i, 1); renderQueue(); }
function togglePasswordInput() { el('password-input-area').style.display = el('opt-password').checked ? 'block' : 'none'; }
function toggleExpiryInput()   { el('expiry-input-area').style.display   = el('opt-expiry').checked   ? 'block' : 'none'; }

async function uploadFiles() {
  if (!pendingFiles.length) return alert('请先选择文件');

  const usePassword = el('opt-password').checked;
  let plainPassword = usePassword ? (el('share-password').value.trim() || randomPassword()) : '';

  const useExpiry = el('opt-expiry').checked;
  let expiresAt = null;
  if (useExpiry) {
    const days = parseInt(el('share-expiry').value);
    if (days > 0) expiresAt = new Date(Date.now() + days * 86400000).toISOString();
  }

  const btn = el('btn-upload');
  btn.disabled = true;
  el('upload-progress-area').style.display = 'block';

  let lastShare = null;

  for (let i = 0; i < pendingFiles.length; i++) {
    const file = pendingFiles[i];
    if (file.size > 50 * 1024 * 1024) { alert(`"${file.name}" 超过 50MB，已跳过`); continue; }

    el('upload-progress-text').textContent = `正在上传 ${file.name} (${i+1}/${pendingFiles.length})...`;

    const extRaw = file.name.includes(".") ? file.name.split(".").pop() : ""; const ext = /^[a-zA-Z0-9]+$/.test(extRaw) ? "." + extRaw : "";
    const storagePath = `public/${Date.now()}_${uid(16)}${ext}`;
    try {
      await storageUpload(storagePath, file, pct => {
        el('upload-progress-fill').style.width = Math.round(pct * 100) + '%';
      });
      const fileRows = await dbInsert('files', {
        name: file.name, size: file.size, storage_path: storagePath
      });
      const shareRows = await dbInsert('shares', {
        id: uid(12), file_id: fileRows[0].id,
        file_name: file.name, file_size: file.size,
        password_hash: usePassword ? simpleHash(plainPassword) : null,
        expires_at: expiresAt
      });
      lastShare = shareRows[0];
    } catch (e) {
      alert(`上传 "${file.name}" 失败：${e.message}`);
    }
  }

  btn.disabled = false;
  el('upload-progress-area').style.display = 'none';
  el('upload-progress-fill').style.width = '0%';
  pendingFiles = [];
  renderQueue();
  el('opt-password').checked = false;
  el('opt-expiry').checked = false;
  el('password-input-area').style.display = 'none';
  el('expiry-input-area').style.display = 'none';
  el('share-password').value = '';
  el('file-input').value = '';

  if (lastShare) {
    renderFileList();
    renderShareList();
    showShareModal(lastShare, plainPassword);
  }
}

// ══════════════════════════════════════════════════════
// 分享弹窗
// ══════════════════════════════════════════════════════
function showShareModal(share, plainPassword) {
  const link = buildShareLink(share.id);
  el('modal-filename').textContent = share.file_name;
  el('modal-link').value = link;

  const pwdSec = el('modal-password-section');
  if (share.password_hash) {
    pwdSec.style.display = 'flex';
    el('modal-password').textContent = plainPassword || '（已设置密码）';
  } else {
    pwdSec.style.display = 'none';
  }

  const expSec = el('modal-expiry-section');
  if (share.expires_at) {
    expSec.style.display = 'block';
    el('modal-expiry-text').textContent = `🕒 有效期至 ${formatDate(share.expires_at)}`;
  } else {
    expSec.style.display = 'none';
  }

  el('copy-toast').style.display = 'none';
  el('modal-overlay').style.display = 'flex';
}

function closeModal() { el('modal-overlay').style.display = 'none'; }

function copyLink() { copyText(el('modal-link').value, null, true); }
function copyPassword() { copyText(el('modal-password').textContent, null, true); }

function copyText(text, btn, toast) {
  try { navigator.clipboard.writeText(text); } catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
  }
  if (btn) { const o = btn.textContent; btn.textContent = '✓ 已复制'; setTimeout(() => btn.textContent = o, 1500); }
  if (toast) { const t = el('copy-toast'); if(t){ t.style.display='block'; setTimeout(()=>t.style.display='none',2000); } }
}

// ══════════════════════════════════════════════════════
// 分享页（任何人可访问）
// ══════════════════════════════════════════════════════
let currentShare = null;

async function initSharePage() {
  const shareId = getShareIdFromURL();
  if (!shareId) { showPage('home'); return; }

  ['share-password-area','share-actions','share-expired','share-not-found'].forEach(id => el(id).style.display = 'none');
  el('share-loading').style.display = 'block';
  el('share-filename').textContent = '加载中...';
  el('share-filesize').textContent = '';

  try {
    const shares = await dbSelect('shares', `id=eq.${shareId}`);
    el('share-loading').style.display = 'none';

    if (!shares || !shares.length) { el('share-not-found').style.display = 'block'; return; }

    const share = shares[0];
    if (share.expires_at && new Date(share.expires_at).getTime() < Date.now()) {
      el('share-filename').textContent = share.file_name;
      el('share-expired').style.display = 'block';
      return;
    }

    currentShare = share;
    el('share-filename').textContent = share.file_name;
    el('share-filesize').textContent = formatSize(share.file_size);

    if (share.password_hash) {
      el('share-password-area').style.display = 'block';
    } else {
      el('share-actions').style.display = 'block';
    }
  } catch (e) {
    el('share-loading').style.display = 'none';
    el('share-not-found').textContent = '加载失败：' + e.message;
    el('share-not-found').style.display = 'block';
  }
}

function verifySharePassword() {
  const input = el('share-pwd-input').value;
  if (simpleHash(input) === currentShare.password_hash) {
    el('share-pwd-error').style.display = 'none';
    el('share-password-area').style.display = 'none';
    el('share-actions').style.display = 'block';
  } else {
    el('share-pwd-error').style.display = 'block';
  }
}

async function downloadSharedFile() {
  if (!currentShare) return;
  const btn = el('btn-download');
  btn.textContent = '⏳ 准备下载...';
  btn.disabled = true;
  try {
    const files = await dbSelect('files', `id=eq.${currentShare.file_id}&select=storage_path,name`);
    if (!files || !files.length) throw new Error('文件不存在');
    const signedUrl = await storageSignedUrl(files[0].storage_path, 3600);

    // 加 download 参数让 Supabase 返回 Content-Disposition: attachment
    const dlUrl = signedUrl + '&download=' + encodeURIComponent(currentShare.file_name);
    const a = document.createElement('a');
    a.href = dlUrl;
    a.download = currentShare.file_name;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    btn.textContent = '⬇ 下载文件';
    btn.disabled = false;
  } catch (e) {
    btn.textContent = '⬇ 下载文件';
    btn.disabled = false;
    alert('下载失败：' + e.message);
  }
}

// ══════════════════════════════════════════════════════
// 初始化
// ══════════════════════════════════════════════════════
(function init() {
  const shareId = getShareIdFromURL();
  if (shareId) { showPage('share'); return; }
  showPage('main');
})();
