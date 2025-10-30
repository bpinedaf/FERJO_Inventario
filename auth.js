// ====== auth.js ======
const AUTH = {
  token: null,
  profile: null,
  roles: [],
};

// ---- Al iniciar sesión con Google ----
function onCredentialResponse(resp){
  AUTH.token = resp.credential || null;
  sessionStorage.setItem('FERJO_ID_TOKEN', AUTH.token || '');

  // Validar token en backend y obtener roles
  fetch(`${apiBase()}/exec?path=me&token=${encodeURIComponent(AUTH.token)}`)
    .then(r=>r.json())
    .then(d=>{
      if (!d.ok) throw new Error('No autorizado');
      AUTH.profile = d.email;
      AUTH.roles = d.roles || [];
      document.getElementById('whoami').textContent = `${d.email} · [${AUTH.roles.join(', ')}]`;
      document.getElementById('signedOut').style.display = 'none';
      document.getElementById('signedIn').style.display  = '';
      applyRoleVisibility();
    })
    .catch(err=>{
      console.error(err);
      logout();
      alert('Error: no autorizado o token inválido.');
    });
}

// ---- Cierre de sesión ----
function logout(){
  AUTH.token = null;
  AUTH.profile = null;
  AUTH.roles = [];
  sessionStorage.removeItem('FERJO_ID_TOKEN');
  document.getElementById('signedIn').style.display  = 'none';
  document.getElementById('signedOut').style.display = '';
  applyRoleVisibility();
}

// ---- Inicialización ----
document.addEventListener('DOMContentLoaded', ()=>{
  const saved = sessionStorage.getItem('FERJO_ID_TOKEN');
  if (saved){
    onCredentialResponse({credential: saved});
  }
  const btn = document.getElementById('btnLogout');
  if (btn) btn.addEventListener('click', logout);
});

// ---- Helpers de rol y visibilidad ----
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

// ---- Métodos fetch con token ----
async function postForm(path, payload={}){
  const token = AUTH.token || sessionStorage.getItem('FERJO_ID_TOKEN') || '';
  const body = new URLSearchParams({...payload, token}).toString();
  const res = await fetch(`${apiBase()}/exec?path=${encodeURIComponent(path)}`, {
    method: 'POST',
    body
  });
  return res.json();
}

async function getJSON(path, params={}){
  const token = AUTH.token || sessionStorage.getItem('FERJO_ID_TOKEN') || '';
  const qs = new URLSearchParams({...params, token}).toString();
  const res = await fetch(`${apiBase()}/exec?path=${encodeURIComponent(path)}&${qs}`);
  return res.json();
}
