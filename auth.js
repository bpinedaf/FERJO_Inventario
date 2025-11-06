// ====== auth.js (control total de acceso) ======
const AUTH = { token: null, profile: null, roles: [] };

// --- Helpers base ---
function apiBase(){ 
  const el = document.getElementById('apiUrl');
  const v  = (el && el.value) || (window.CONFIG && window.CONFIG.API) || '';
  return (v || '').replace(/\/+$/,'');
}

function getToken(){
  return AUTH.token || sessionStorage.getItem('FERJO_ID_TOKEN') || '';
}

function hasRole(required){
  if (!Array.isArray(required)) {
    required = (required||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  }
  if (AUTH.roles.includes('admin')) return true;
  return required.some(r => AUTH.roles.includes(r));
}

function applyRoleVisibility(){
  document.querySelectorAll('[data-roles]').forEach(el=>{
    const req = el.getAttribute('data-roles') || '';
    el.style.display = hasRole(req) ? '' : 'none';
  });
}

// Mostrar/Ocultar el contenido protegido
function showProtectedUI(show){
  const main = document.getElementById('appMain');
  if (main) main.style.display = show ? '' : 'none';
  if (!show){
    // limpiar estados activos por higiene visual
    document.querySelectorAll('.tab.active').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.panel.active').forEach(p=>p.classList.remove('active'));
  }
}

// ---- VALIDAR TOKEN EN BACKEND ----
async function validateTokenAndLoadProfile(idToken){
  const url = `${apiBase()}/exec?path=me&token=${encodeURIComponent(idToken)}`;
  const res = await fetch(url);
  let data; 
  try { data = await res.json(); } catch { data = { ok:false, raw: await res.text() }; }

  if (!data || !data.ok){
    const msg = (data && data.error) ? data.error : 'Respuesta inválida de /me';
    throw new Error(msg);
  }

  AUTH.profile = data.email;
  AUTH.roles   = data.roles || [];

  const who = document.getElementById('whoami');
  if (who) who.textContent = `${data.email} · [${AUTH.roles.join(', ')}]`;

  const si = document.getElementById('signedIn');
  const so = document.getElementById('signedOut');
  if (si) si.style.display = '';
  if (so) so.style.display = 'none';

  applyRoleVisibility();
  showProtectedUI(true); // <- mostrar contenido protegido al validar
}

// ---- Callback de Google Identity Services ----
async function onCredentialResponse(resp){
  try{
    AUTH.token = resp && resp.credential ? resp.credential : null;
    if (!AUTH.token) throw new Error('Token vacío');
    sessionStorage.setItem('FERJO_ID_TOKEN', AUTH.token);

    await validateTokenAndLoadProfile(AUTH.token);
  }catch(err){
    console.error('[AUTH] Error onCredentialResponse:', err);
    logout(true);
    alert('Error: no autorizado o token inválido.\n\nDetalle: ' + (err && err.message ? err.message : String(err)));
  }
}

// ---- Cierre de sesión ----
function logout(silent=false){
  AUTH.token = null; AUTH.profile = null; AUTH.roles = [];
  sessionStorage.removeItem('FERJO_ID_TOKEN');

  const si = document.getElementById('signedIn');
  const so = document.getElementById('signedOut');
  if (si) si.style.display = 'none';
  if (so) so.style.display = '';

  applyRoleVisibility();
  showProtectedUI(false); // <- ocultar contenido protegido

  if (!silent) alert('Sesión cerrada.');
}

// ---- Inicialización segura ----
document.addEventListener('DOMContentLoaded', async ()=>{
  // Oculto por defecto hasta validar sesión
  showProtectedUI(false);

  const saved = sessionStorage.getItem('FERJO_ID_TOKEN');
  if (saved){
    try{
      await validateTokenAndLoadProfile(saved);
      AUTH.token = saved;
    }catch(err){
      console.warn('[AUTH] Token guardado inválido; se requiere login:', err);
      sessionStorage.removeItem('FERJO_ID_TOKEN');
      logout(true);
    }
  }

  const btn = document.getElementById('btnLogout');
  if (btn) btn.addEventListener('click', ()=> logout());
});

// ---- Exponer helpers necesarios en global ----
window.AUTH = AUTH;
window.onCredentialResponse = onCredentialResponse;
window.hasRole = hasRole;
window.applyRoleVisibility = applyRoleVisibility;
window.getToken = getToken;
window.showProtectedUI = showProtectedUI;
