/* =====================================================
   FileVault — App Logic  (Supabase backend)
   ===================================================== */

// ── Config helpers ─────────────────────────────────────
const CFG_KEY = 'fv_config';

function getConfig() {
  try { return JSON.parse(localStorage.getItem(CFG_KEY)) || null; } catch { return null; }
}
function saveConfigStore(url, key) {
  localStorage.setItem(CFG_KEY, JSON.stringify({ url, key }));
}

// ── Supabase REST client ───────────────────────────────
// Thin wrapper — no SDK needed, just fetch()
let SB = null; // { url, anonKey, accessToken }

function initSB(url, key, accessToken = null) {
  SB = { url: url.replace(/\/$/, ''), anonKey: key, accessToken };
}

function sbHeaders(extra = {}) {
  const h = {
    'Content-Type': 'application/json',
    'apikey': SB.anonKey,
    'Authorization': 'Bearer ' + (SB.accessToken || SB.anonKey),
    ...extra
  };
  return h;
}

// Auth
async function sbSignUp(email, password) {
  const r = await fetch(`${SB.url}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SB.anonKey },
    body: JSON.stringify({ email, password })
  });
  return r.json();
}

async function sbSignIn(email, password) {
  const r = await fetch(`${SB.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SB.anonKey },
    body: JSON.stringify({ email, password })
  });
  return r.json();
}

async function sbSignOut() {
  await fetch(`${SB.url}/auth/v1/logout`, {
    method: 'POST',
    headers: sbHeaders()
  });
}

// DB helpers
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
  return true;
}

// Storage
async function storageUpload(path, file, onProgress) {
  // Use XMLHttpRequest for progress tracking
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${SB.url}/storage/v1/object/files/${path}`);
    xhr.setRequestHeader('apikey', SB.anonKey);
    xhr.setRequestHeader('Authorization', 'Bearer ' + (SB.accessToken || SB.anonKey));
    xhr.upload.onprogress = e => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
      else reject(new Error(xhr.responseText));
    };
    xhr.onerror = () => reject(new Error('Upload failed'));
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
  const r = await fetch(`${SB.url}/storage/v1/object/files/${path}`, {
    method: 'DELETE',
    headers: sbHeaders()
  });
  return r.ok;
}

// ══════════════════════════════════════════════════════
// SESSION
// ══════════════════════════════════════════════════════
const SESSION_KEY = 'fv_session';
let currentUser = null;

function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (s && s.accessToken) {
      currentUser = s;
      const cfg = getConfig();
      if (cfg) initSB(cfg.url, cfg.key, s.accessToken);
      return true;
    }
  } catch {}
  return false;
}

function saveSession(data) {
  const s = {
    accessToken: data.access_token,
    userId: data.user.id,
    email: data.user.email
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  currentUser = s;
  const cfg = getConfig();
  if (cfg) initSB(cfg.url, cfg.key, s.accessToken);
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  currentUser = null;
}

// ══════════════════════════════════════════════════════
// PAGE ROUTING
// ══════════════════════════════════════════════════════
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pg = document.getElementById('page-' + name);
  if (pg) pg.classList.add('active');
  updateNav();
  if (name === 'dashboard') initDashboard();
  if (name === 'share') initSharePage();
  window.scrollTo(0, 0);
}

function updateNav() {
  const li = !!currentUser;
  el('btn-login').style.display     = li ? 'none' : '';
  el('btn-register').style.display  = li ? 'none' : '';
  el('btn-dashboard').style.display = li ? '' : 'none';
  el('btn-logout').style.display    = li ? '' : 'none';
  el('nav-username').textContent    = li ? ('👤 ' + (currentUser.email || '').split('@')[0]) : '';
}

function el(id) { return document.getElementById(id); }
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ══════════════════════════════════════════════════════
// SETUP
// ══════════════════════════════════════════════════════
async function saveConfig() {
  const url = el('cfg-url').value.trim();
  const key = el('cfg-key').value.trim();
  const errEl = el('setup-error');
  errEl.style.display = 'none';

  if (!url || !key) return showErr(errEl, '请填写 URL 和 Key');
  if (!url.startsWith('https://')) return showErr(errEl, 'URL 须以 https:// 开头');

  // Test connection
  try {
    const r = await fetch(`${url.replace(/\/$/,'')}/rest/v1/shares?limit=1`, {
      headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
    });
    if (r.status === 401 || r.status === 403) {
      // Expected if RLS is set up — config is valid
    } else if (!r.ok && r.status !== 400) {
      const t = await r.text();
      return showErr(errEl, '连接失败：' + t.slice(0,100));
    }
  } catch (e) {
    return showErr(errEl, '无法连接到 Supabase，请检查 URL');
  }

  saveConfigStore(url, key);
  initSB(url, key);
  showPage('home');
  el('setup-banner').style.display = 'none';
}

function copySql() {
  const sql = el('sql-block').innerText;
  navigator.clipboard.writeText(sql).then(() => alert('SQL 已复制！'));
}
function copyStorageSql() {
  const sql = `-- 允许已登录用户上传
CREATE POLICY "auth upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'files');

-- 允许已登录用户读取文件
CREATE POLICY "auth download" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'files');

-- 允许所有人通过 signed URL 访问
CREATE POLICY "signed url access" ON storage.objects
  FOR SELECT USING (bucket_id = 'files');

-- 允许用户删除文件
CREATE POLICY "auth delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'files');`;
  navigator.clipboard.writeText(sql).then(() => alert('Storage SQL 已复制！'));
}

// ══════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════
async function register() {
  const email = el('reg-email').value.trim();
  const pw    = el('reg-password').value;
  const pw2   = el('reg-password2').value;
  const errEl = el('reg-error');
  const okEl  = el('reg-success');
  errEl.style.display = 'none';
  okEl.style.display  = 'none';

  if (!email || !pw) return showErr(errEl, '请填写邮箱和密码');
  if (pw.length < 6)  return showErr(errEl, '密码至少 6 位');
  if (pw !== pw2)     return showErr(errEl, '两次密码不一致');

  setBtnLoading('btn-do-register', true);
  const data = await sbSignUp(email, pw);
  setBtnLoading('btn-do-register', false);

  if (data.error) return showErr(errEl, data.error.message || data.msg || '注册失败');

  // Check if email confirmation required
  if (data.user && !data.session) {
    okEl.textContent = '注册成功！请查收邮件并点击确认链接后再登录。';
    okEl.style.display = 'block';
    return;
  }
  if (data.session) {
    saveSession(data.session);
    showPage('dashboard');
    return;
  }
  okEl.textContent = '注册成功！请登录。';
  okEl.style.display = 'block';
  setTimeout(() => showPage('login'), 1500);
}

async function login() {
  const email = el('login-email').value.trim();
  const pw    = el('login-password').value;
  const errEl = el('login-error');
  errEl.style.display = 'none';

  if (!email || !pw) return showErr(errEl, '请填写邮箱和密码');

  setBtnLoading('btn-do-login', true);
  const data = await sbSignIn(email, pw);
  setBtnLoading('btn-do-login', false);

  if (data.error || data.error_description) {
    return showErr(errEl, data.error_description || data.error || '登录失败，请检查邮箱和密码');
  }
  if (!data.access_token) return showErr(errEl, '登录失败，请重试');

  saveSession(data);
  showPage('dashboard');
}

async function logout() {
  try { await sbSignOut(); } catch {}
  clearSession();
  showPage('home');
}

// ══════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════
function initDashboard() {
  if (!currentUser) { showPage('login'); return; }
  const email = currentUser.email || '';
  el('sidebar-email').textContent = email;
  el('sidebar-avatar').textContent = email[0].toUpperCase();
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

// ── File list ──────────────────────────────────────────
async function renderFileList() {
  const container = el('file-list');
  container.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>加载中...</p></div>`;

  let files;
  try {
    files = await dbSelect('files', `select=id,name,size,created_at,storage_path&order=created_at.desc`);
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><p style="color:var(--danger)">加载失败：${esc(e.message)}</p></div>`;
    return;
  }

  if (!files.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📂</div><p>还没有文件，<a href="#" onclick="switchTab('upload',document.querySelector('[data-tab=upload]'))">立即上传</a></p></div>`;
    return;
  }

  container.innerHTML = files.map(f => `
    <div class="file-item" id="fi-${f.id}">
      <div class="file-thumb">${fileEmoji(f.name)}</div>
      <div class="file-info">
        <div class="file-name">${esc(f.name)}</div>
        <div class="file-meta">${formatSize(f.size)} · ${formatDate(f.created_at)}</div>
      </div>
      <div class="file-actions">
        <button class="btn btn-sm btn-ghost" onclick="createShareForFile('${f.id}','${esc(f.name)}',${f.size})">🔗 分享</button>
        <button class="btn btn-sm btn-danger" onclick="deleteFile('${f.id}','${esc(f.storage_path)}')">删除</button>
      </div>
    </div>
  `).join('');
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

// ── Share list ─────────────────────────────────────────
async function renderShareList() {
  const container = el('share-list');
  container.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>加载中...</p></div>`;

  let shares;
  try {
    shares = await dbSelect('shares', `select=*&order=created_at.desc`);
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><p style="color:var(--danger)">加载失败：${esc(e.message)}</p></div>`;
    return;
  }

  if (!shares.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🔗</div><p>还没有分享链接</p></div>`;
    return;
  }

  const now = Date.now();
  container.innerHTML = shares.map(s => {
    const isExpired = s.expires_at && new Date(s.expires_at).getTime() < now;
    const link = buildShareLink(s.id);
    const hasPwd = !!s.password_hash;
    return `
      <div class="share-item">
        <div class="share-item-header">
          <div class="share-item-name">${esc(s.file_name)}</div>
          <div class="share-item-badges">
            ${isExpired ? '<span class="badge badge-expired">已过期</span>' : '<span class="badge badge-active">有效</span>'}
            ${hasPwd ? '<span class="badge badge-lock">🔒 有密码</span>' : ''}
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
}

async function deleteShare(shareId) {
  try {
    await dbDelete('shares', `id=eq.${shareId}`);
    renderShareList();
  } catch (e) { alert('删除失败：' + e.message); }
}

// Create quick share from file list (no password/expiry prompt)
async function createShareForFile(fileId, fileName, fileSize) {
  // Check existing shares
  let existing;
  try {
    existing = await dbSelect('shares', `file_id=eq.${fileId}&order=created_at.desc&limit=1`);
  } catch { existing = []; }

  if (existing.length) {
    showShareModal(existing[0], '');
    return;
  }

  const shareId = uid(12);
  try {
    const rows = await dbInsert('shares', {
      id: shareId,
      file_id: fileId,
      owner_id: currentUser.userId,
      file_name: fileName,
      file_size: fileSize,
      password_hash: null,
      expires_at: null
    });
    showShareModal(rows[0], '');
    renderShareList();
  } catch (e) { alert('创建分享失败：' + e.message); }
}

// ══════════════════════════════════════════════════════
// UPLOAD
// ══════════════════════════════════════════════════════
let pendingFiles = [];

function handleFiles(fileList) {
  pendingFiles = [...fileList];
  renderQueue();
}
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
      <span class="queue-remove" onclick="removeFromQueue(${i})" title="移除">✕</span>
    </div>
  `).join('');
}

function removeFromQueue(i) { pendingFiles.splice(i, 1); renderQueue(); }
function togglePasswordInput() { el('password-input-area').style.display = el('opt-password').checked ? 'block' : 'none'; }
function toggleExpiryInput()   { el('expiry-input-area').style.display   = el('opt-expiry').checked   ? 'block' : 'none'; }

async function uploadFiles() {
  if (!pendingFiles.length) return alert('请先选择文件');

  const usePassword = el('opt-password').checked;
  let plainPassword = '';
  if (usePassword) {
    plainPassword = el('share-password').value.trim() || randomPassword();
  }

  const useExpiry = el('opt-expiry').checked;
  let expiresAt = null;
  if (useExpiry) {
    const days = parseInt(el('share-expiry').value);
    if (days > 0) expiresAt = new Date(Date.now() + days * 86400000).toISOString();
  }

  el('btn-upload').disabled = true;
  el('upload-progress-area').style.display = 'block';

  let lastShare = null;
  let lastPassword = '';

  for (let i = 0; i < pendingFiles.length; i++) {
    const file = pendingFiles[i];
    if (file.size > 50 * 1024 * 1024) { alert(`"${file.name}" 超过 50MB，已跳过`); continue; }

    const progressText = el('upload-progress-text');
    progressText.textContent = `正在上传 ${file.name} (${i+1}/${pendingFiles.length})...`;

    const storagePath = `${currentUser.userId}/${Date.now()}_${file.name}`;

    try {
      // 1. Upload to storage
      await storageUpload(storagePath, file, pct => {
        el('upload-progress-fill').style.width = Math.round(pct * 100) + '%';
      });

      // 2. Insert file record
      const fileRows = await dbInsert('files', {
        user_id: currentUser.userId,
        name: file.name,
        size: file.size,
        storage_path: storagePath
      });
      const fileId = fileRows[0].id;

      // 3. Create share record
      const shareId = uid(12);
      const shareRows = await dbInsert('shares', {
        id: shareId,
        file_id: fileId,
        owner_id: currentUser.userId,
        file_name: file.name,
        file_size: file.size,
        password_hash: usePassword ? simpleHash(plainPassword) : null,
        expires_at: expiresAt
      });
      lastShare = shareRows[0];
      lastPassword = plainPassword;

    } catch (e) {
      alert(`上传 "${file.name}" 失败：${e.message}`);
    }
  }

  // Reset UI
  el('btn-upload').disabled = false;
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
    showShareModal(lastShare, lastPassword);
  }
}

// ══════════════════════════════════════════════════════
// SHARE MODAL
// ══════════════════════════════════════════════════════
function showShareModal(share, plainPassword) {
  const link = buildShareLink(share.id);
  el('modal-filename').textContent = share.file_name;
  el('modal-link').value = link;

  if (share.password_hash) {
    el('modal-password-section').style.display = 'flex';
    el('modal-password').textContent = plainPassword || '（密码已设置）';
  } else {
    el('modal-password-section').style.display = 'none';
  }

  if (share.expires_at) {
    el('modal-expiry-section').style.display = 'block';
    el('modal-expiry-text').textContent = `🕒 有效期至 ${formatDate(share.expires_at)}`;
  } else {
    el('modal-expiry-section').style.display = 'none';
  }

  el('copy-toast').style.display = 'none';
  el('modal-overlay').style.display = 'flex';
}

function closeModal() { el('modal-overlay').style.display = 'none'; }

function copyLink() {
  copyText(el('modal-link').value, null, true);
}
function copyPassword() {
  copyText(el('modal-password').textContent, null, true);
}
function copyText(text, btn, toast) {
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
  };
  (navigator.clipboard ? navigator.clipboard.writeText(text).catch(fallback) : Promise.resolve(fallback()))
    .then ? (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.resolve(fallback()))
    .then(() => {
      if (btn) { const o = btn.textContent; btn.textContent = '✓'; setTimeout(() => btn.textContent = o, 1500); }
      if (toast) { const t = el('copy-toast'); if(t){t.style.display='block'; setTimeout(()=>t.style.display='none',2000);} }
    }).catch(fallback) : fallback();
  // simpler path
  try { navigator.clipboard.writeText(text).catch(() => fallback()); } catch { fallback(); }
  if (btn) { const o = btn.textContent; btn.textContent = '✓ 已复制'; setTimeout(() => btn.textContent = o, 1500); }
  if (toast) { const t = el('copy-toast'); if(t){t.style.display='block'; setTimeout(()=>t.style.display='none',2000);} }
}

// ══════════════════════════════════════════════════════
// SHARE PAGE (public — no login required)
// ══════════════════════════════════════════════════════
let currentShare = null;

async function initSharePage() {
  const shareId = getShareIdFromURL();
  if (!shareId) { showPage('home'); return; }

  // Hide all state elements
  ['share-password-area','share-actions','share-expired','share-not-found'].forEach(id => {
    el(id).style.display = 'none';
  });
  el('share-loading').style.display = 'block';
  el('share-filename').textContent = '加载中...';
  el('share-filesize').textContent = '';

  const cfg = getConfig();
  if (!cfg) {
    el('share-loading').style.display = 'none';
    el('share-not-found').textContent = '站点尚未配置，请联系管理员。';
    el('share-not-found').style.display = 'block';
    return;
  }
  // Use anon key for public share lookup (no user session needed)
  initSB(cfg.url, cfg.key, currentUser?.accessToken || null);

  let shares;
  try {
    shares = await dbSelect('shares', `id=eq.${shareId}`);
  } catch (e) {
    el('share-loading').style.display = 'none';
    el('share-not-found').textContent = '加载失败：' + e.message;
    el('share-not-found').style.display = 'block';
    return;
  }

  el('share-loading').style.display = 'none';

  if (!shares || !shares.length) {
    el('share-not-found').style.display = 'block';
    return;
  }

  const share = shares[0];

  if (share.expires_at && new Date(share.expires_at).getTime() < Date.now()) {
    el('share-filename').textContent = share.file_name;
    el('share-expired').style.display = 'block';
    return;
  }

  currentShare = share;
  el('share-filename').textContent = share.file_name;
  el('share-filesize').textContent = formatSize(share.file_size) + ' · 点击下方按钮下载';

  if (share.password_hash) {
    el('share-password-area').style.display = 'block';
  } else {
    el('share-actions').style.display = 'block';
    el('download-hint').textContent = '文件将通过临时安全链接下载，有效期 1 小时';
  }
}

function verifySharePassword() {
  const input = el('share-pwd-input').value;
  const errEl = el('share-pwd-error');
  if (simpleHash(input) === currentShare.password_hash) {
    errEl.style.display = 'none';
    el('share-password-area').style.display = 'none';
    el('share-actions').style.display = 'block';
    el('download-hint').textContent = '文件将通过临时安全链接下载，有效期 1 小时';
  } else {
    errEl.style.display = 'block';
  }
}

async function downloadSharedFile() {
  if (!currentShare) return;
  const btn = el('btn-download');
  btn.textContent = '⏳ 生成下载链接...';
  btn.disabled = true;

  try {
    // Get file record to find storage path
    const cfg = getConfig();
    // We need a signed URL — use the anon key for storage access
    // First, get the file info
    const files = await dbSelect('files', `id=eq.${currentShare.file_id}&select=storage_path,name`);
    if (!files || !files.length) throw new Error('文件记录不存在');

    const storagePath = files[0].storage_path;

    // Generate signed URL (valid 1 hour)
    const signedUrl = await storageSignedUrl(storagePath, 3600);

    // Trigger download
    const a = document.createElement('a');
    a.href = signedUrl;
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
    alert('生成下载链接失败：' + e.message);
  }
}

// ══════════════════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════════════════
function buildShareLink(shareId) {
  const base = window.location.href.split('?')[0];
  return base + '?share=' + shareId;
}
function getShareIdFromURL() {
  return new URLSearchParams(window.location.search).get('share');
}
function uid(len = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({length: len}, () => chars[Math.random() * chars.length | 0]).join('');
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
  if (bytes < 1048576) return (bytes/1024).toFixed(1) + ' KB';
  return (bytes/1048576).toFixed(1) + ' MB';
}
function formatDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('zh-CN', {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
}
function showErr(el, msg) { el.textContent = msg; el.style.display = 'block'; }
function setBtnLoading(id, on) {
  const b = document.getElementById(id);
  b.disabled = on;
  b.textContent = on ? '处理中...' : (id.includes('register') ? '注册账号' : '登录');
}

// ══════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════
(function init() {
  const cfg = getConfig();

  // Check for share URL first
  const shareId = getShareIdFromURL();
  if (shareId) {
    if (cfg) initSB(cfg.url, cfg.key);
    loadSession();
    showPage('share');
    return;
  }

  if (!cfg) {
    el('setup-banner').style.display = 'block';
    showPage('setup');
    return;
  }

  initSB(cfg.url, cfg.key);

  if (loadSession()) {
    showPage('dashboard');
  } else {
    showPage('home');
  }
})();
