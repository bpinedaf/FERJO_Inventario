// ====== auth.js (reemplazo completo) ======
const AUTH = { token: null, profile: null, roles: [] };

// Helper: API base viene de admin.js/config.js
function apiBase(){ 
  const el = document.getElementById('apiUrl');
  const v  = (el && el.value) || (window.CONFIG && window.CONFIG.API) || '';
  return (v || '').replace(/\/+$/,'');
}
function hasRole(required){
  if (!Array.isArray(required)) required = (required||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  if (AUTH.roles.includes('admin')) return true;
  return required.some(r => AUTH.roles.includes(r));
}
function applyRoleVisibility(){
  document.querySelectorAll('[data-roles]').forEach(el=>{
    const req = el.getAttribute('data-roles') || '';
    el.style.display = hasRole(req) ? '' : 'none';
  });
}
function logout(silent=false){
  AUTH.token = null; AUTH.profile = null; AUTH.roles = [];
  sessionStorage.removeItem('FERJO_ID_TOKEN');
  const si = document.getElementById('signedIn');
  const so = document.getElementById('signedOut');
  if (si) si.style.display = 'none';
  if (so) so.style.display = '';
  applyRoleVisibility();
  if (!silent) alert('Sesión cerrada.');
}

// ---- VALIDAR TOKEN EN BACKEND ----
async function validateTokenAndLoadProfile(idToken){
  const url = `${apiBase()}/exec?path=me&token=${encodeURIComponent(idToken)}`;
  const res = await fetch(url);
  let data; try{ data = await res.json(); }catch{ data = { ok:false, raw: await res.text() }; }

  if (!data || !data.ok){
    // Mensaje más explícito para depurar
    const msg = data && data.error ? data.error : 'Respuesta inválida de /me';
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
}

// ---- Callback GIS ----
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

// ---- Inicialización segura ----
document.addEventListener('DOMContentLoaded', async ()=>{
  // Siempre forzamos re-login si el token almacenado no valida (tokens GIS expiran pronto)
  const saved = sessionStorage.getItem('FERJO_ID_TOKEN');
  if (saved){
    try{
      await validateTokenAndLoadProfile(saved);
      AUTH.token = saved;
    }catch(err){
      // Token guardado vencido o aud distinto -> limpiar y mostrar botón
      console.warn('[AUTH] Token guardado inválido, se pide login nuevamente:', err);
      sessionStorage.removeItem('FERJO_ID_TOKEN');
      logout(true);
    }
  }

  const btn = document.getElementById('btnLogout');
  if (btn) btn.addEventListener('click', ()=> logout());
});

// ---- Exponer helpers a admin.js (si hiciera falta) ----
window.AUTH = AUTH;
window.onCredentialResponse = onCredentialResponse;
window.hasRole = hasRole;
window.applyRoleVisibility = applyRoleVisibility;
