// SECRETARIO IA — React Frontend v4.0
const { useState, useEffect, useRef, useCallback, createContext, useContext } = React;
const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';

const api = {
  async request(path, options) {
    options = options || {};
    const token = localStorage.getItem('sai_token');
    const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers);
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(API_BASE + path, Object.assign({}, options, { headers }));
    const data = await res.json().catch(function() { return {}; });
    if (!res.ok) throw Object.assign(new Error(data.error || 'Error del servidor'), { status: res.status, data });
    return data;
  },
  get: function(p) { return api.request(p); },
  post: function(p, b) { return api.request(p, { method: 'POST', body: JSON.stringify(b) }); },
  put: function(p, b) { return api.request(p, { method: 'PUT', body: JSON.stringify(b) }); },
  del: function(p) { return api.request(p, { method: 'DELETE' }); }
};

const AuthContext = createContext(null);
function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState(null);
  useEffect(function() {
    const token = localStorage.getItem('sai_token');
    const saved = localStorage.getItem('sai_user');
    if (token && saved) { try { setUser(JSON.parse(saved)); } catch(e) {} }
    setLoading(false);
  }, []);
  const refreshSubscription = async function() {
    try {
      const data = await api.get('/api/subscription');
      if (data && data.subscription) {
        setSubscription(data.subscription);
        setUser(function(prev) {
          if (!prev) return prev;
          const updated = Object.assign({}, prev, { subscription_status: data.subscription.status });
          localStorage.setItem('sai_user', JSON.stringify(updated));
          return updated;
        });
      }
    } catch(e) {}
  };
  const login = async function(email) {
    const data = await api.post('/api/auth/login', { email });
    localStorage.setItem('sai_token', data.token);
    localStorage.setItem('sai_user', JSON.stringify(data.user));
    setUser(data.user);
    setTimeout(refreshSubscription, 500);
    return data.user;
  };
  const register = async function(email, name) {
    const data = await api.post('/api/auth/register', { email, name });
    localStorage.setItem('sai_token', data.token);
    localStorage.setItem('sai_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };
  const logout = function() {
    localStorage.removeItem('sai_token');
    localStorage.removeItem('sai_user');
    setUser(null); setSubscription(null);
  };
  const isPro = function() { return user && (user.subscription_status === 'active' || user.subscription_status === 'trial'); };
  return React.createElement(AuthContext.Provider, { value: { user, login, register, logout, loading, isPro, subscription, refreshSubscription } }, children);
}
const useAuth = function() { return useContext(AuthContext); };

// ── TOKENS DE COLOR ──────────────────────────────────────────────────────────
const C = {
  sidebar:     '#1A0808',
  sidebarMid:  '#2A0F0F',
  accent:      '#8B1A1A',
  accentDark:  '#5C0F0F',
  gold:        '#C9A96E',
  goldLight:   '#E8CFA0',
  cream:       '#FAF7F4',
  creamDark:   '#F0EBE4',
  panel:       '#E8E0D8',
  wine:        '#3D0C0C',
  wineMid:     '#6B1E1E',
  wineLight:   '#9B4040',
  border:      '#D4CCC4',
  borderLight: '#E2DBD3',
  weekend:     '#EDE4DA',
};

// ── ICONOS SVG ───────────────────────────────────────────────────────────────
function Icon({ name, size, color, style }) {
  size = size || 18; color = color || 'currentColor';
  const paths = {
    calendar:   'M8 2v2M16 2v2M3 8h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
    chat:       'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
    user:       'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    settings:   'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
    star:       'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
    logout:     'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1',
    plus:       'M12 5v14M5 12h14',
    send:       'M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z',
    clock:      'M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zM12 6v6l4 2',
    trash:      'M3 6h18M8 6V4h8v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6',
    lightning:  'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
    x:          'M18 6L6 18M6 6l12 12',
    check:      'M20 6L9 17l-5-5',
    chevLeft:   'M15 18l-6-6 6-6',
    chevRight:  'M9 18l6-6-6-6',
    chevDown:   'M6 9l6 6 6-6',
    alert:      'M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
    creditCard: 'M1 4h22v16H1zM1 10h22',
  };
  return React.createElement('svg', {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: color, strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
    style: Object.assign({ display: 'block', flexShrink: 0 }, style)
  }, React.createElement('path', { d: paths[name] || paths.star }));
}

function LogoIcon({ size }) {
  size = size || 32;
  return React.createElement('svg', { width: size, height: size, viewBox: '0 0 200 200', fill: 'none', xmlns: 'http://www.w3.org/2000/svg' },
    React.createElement('circle', { cx: 100, cy: 100, r: 90, fill: 'none', stroke: 'white', strokeWidth: 12 }),
    React.createElement('rect', { x: 42, y: 42, width: 116, height: 116, rx: 10, fill: 'none', stroke: 'white', strokeWidth: 12 }),
    React.createElement('path', { d: 'M100 42 A58 58 0 0 1 158 100', fill: 'none', stroke: 'white', strokeWidth: 12, strokeLinecap: 'round' }),
    React.createElement('path', { d: 'M42 100 A58 58 0 0 0 100 158', fill: 'none', stroke: 'white', strokeWidth: 12, strokeLinecap: 'round' })
  );
}

// ── TOAST ────────────────────────────────────────────────────────────────────
function Toast({ message, type, onClose }) {
  useEffect(function() { const t = setTimeout(onClose, 4000); return function() { clearTimeout(t); }; }, []);
  const bg = type === 'error' ? '#7F1D1D' : C.accent;
  return React.createElement('div', {
    style: { position: 'fixed', bottom: 24, right: 24, zIndex: 9999, padding: '12px 20px', background: bg, color: C.cream, borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.25)', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 10, animation: 'fadeIn 0.2s ease' }
  }, React.createElement('div', { style: { width: 6, height: 6, borderRadius: '50%', background: C.gold, flexShrink: 0 } }), message);
}
function useToast() {
  const [toast, setToast] = useState(null);
  const show = function(msg, type) { setToast({ message: msg, type: type || 'info', id: Date.now() }); };
  const hide = function() { setToast(null); };
  const ToastEl = toast ? React.createElement(Toast, Object.assign({}, toast, { onClose: hide })) : null;
  return { show, ToastEl };
}

// ── AUTH MODAL ───────────────────────────────────────────────────────────────
function AuthModal({ onClose }) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async function(e) {
    e.preventDefault();
    if (!email) return setError('Email requerido');
    if (mode === 'register' && !name) return setError('Nombre requerido');
    setLoading(true); setError('');
    try {
      if (mode === 'login') await login(email); else await register(email, name);
      onClose();
    } catch(err) { setError(err.message); } finally { setLoading(false); }
  };

  const inputS = { width: '100%', background: C.creamDark, border: '1px solid ' + C.border, borderRadius: 12, padding: '12px 14px', color: C.wine, fontSize: 13, outline: 'none', boxSizing: 'border-box' };
  const overlayS = { position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(61,12,12,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' };
  const cardS = { background: C.cream, borderRadius: 24, padding: 32, width: 380, boxShadow: '0 20px 60px rgba(61,12,12,0.2)', border: '1px solid ' + C.border };

  return React.createElement('div', { style: overlayS, onClick: function(e) { if (e.target === e.currentTarget) onClose(); } },
    React.createElement('div', { style: cardS },
      React.createElement('div', { style: { textAlign: 'center', marginBottom: 28 } },
        React.createElement('div', { style: { width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg,' + C.accent + ',' + C.accentDark + ')', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' } },
          React.createElement(LogoIcon, { size: 30 })
        ),
        React.createElement('h2', { style: { margin: 0, color: C.wine, fontSize: 20, fontWeight: 700 } }, 'Secretario IA'),
        React.createElement('p', { style: { margin: '4px 0 0', color: C.wineLight, fontSize: 13 } }, 'Tu agenda inteligente')
      ),
      React.createElement('div', { style: { display: 'flex', background: C.panel, borderRadius: 12, padding: 4, marginBottom: 20, gap: 4 } },
        ['login','register'].map(function(m) {
          return React.createElement('button', { key: m, onClick: function() { setMode(m); setError(''); },
            style: { flex: 1, padding: '8px 0', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, transition: 'all 0.2s', background: mode === m ? 'white' : 'transparent', color: mode === m ? C.wine : C.wineLight, boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,0.1)' : 'none' }
          }, m === 'login' ? 'Iniciar sesión' : 'Registrarse');
        })
      ),
      React.createElement('form', { onSubmit: handleSubmit, style: { display: 'flex', flexDirection: 'column', gap: 12 } },
        mode === 'register' && React.createElement('input', { type: 'text', value: name, onChange: function(e) { setName(e.target.value); }, placeholder: 'Tu nombre', style: inputS }),
        React.createElement('input', { type: 'email', value: email, onChange: function(e) { setEmail(e.target.value); }, placeholder: 'tu@email.com', style: inputS }),
        error && React.createElement('div', { style: { color: '#B91C1C', fontSize: 12, padding: '8px 12px', background: '#FEF2F2', borderRadius: 8 } }, error),
        React.createElement('button', { type: 'submit', disabled: loading, style: { padding: '12px 0', borderRadius: 12, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,' + C.accent + ',' + C.accentDark + ')', color: 'white', fontSize: 14, fontWeight: 600, marginTop: 4 } },
          loading ? 'Cargando...' : mode === 'login' ? 'Entrar' : 'Crear cuenta'
        )
      ),
      React.createElement('p', { style: { textAlign: 'center', fontSize: 11, color: C.wineLight, marginTop: 16, opacity: 0.5 } }, 'Acceso seguro sin contraseña')
    )
  );
}

// ── UPGRADE MODAL ────────────────────────────────────────────────────────────
function UpgradeModal({ onClose, onShowAuth }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const handleUpgrade = async function() {
    if (!user) { onClose(); onShowAuth && onShowAuth(); return; }
    setLoading(true);
    try { const data = await api.get('/api/stripe/checkout'); if (data.url) window.location.href = data.url; }
    catch(err) { alert('Error al procesar el pago.'); }
    finally { setLoading(false); }
  };
  const features = ['IA ilimitada sin restricciones', 'Eventos ilimitados', 'Planes de entrenamiento con IA', 'Memoria personalizada', 'Emails de confirmación automáticos'];
  const overlayS = { position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(61,12,12,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' };
  const cardS = { background: C.cream, borderRadius: 24, padding: 32, width: 360, boxShadow: '0 20px 60px rgba(61,12,12,0.2)', textAlign: 'center' };
  return React.createElement('div', { style: overlayS, onClick: function(e) { if (e.target === e.currentTarget) onClose(); } },
    React.createElement('div', { style: cardS },
      React.createElement('div', { style: { width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg,' + C.accent + ',' + C.accentDark + ')', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' } },
        React.createElement(Icon, { name: 'lightning', size: 28, color: 'white' })
      ),
      React.createElement('h3', { style: { margin: '0 0 4px', color: C.wine, fontSize: 18, fontWeight: 700 } }, 'Secretario PRO'),
      React.createElement('p', { style: { margin: '0 0 20px', color: C.wineLight, fontSize: 13 } }, 'Desbloquea todo el potencial'),
      React.createElement('div', { style: { background: C.panel, borderRadius: 14, padding: 16, marginBottom: 20, textAlign: 'left' } },
        features.map(function(f, i) {
          return React.createElement('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' } },
            React.createElement('div', { style: { width: 20, height: 20, borderRadius: '50%', background: 'linear-gradient(135deg,' + C.accent + ',' + C.accentDark + ')', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } },
              React.createElement(Icon, { name: 'check', size: 10, color: 'white' })
            ),
            React.createElement('span', { style: { fontSize: 13, color: C.wine } }, f)
          );
        })
      ),
      React.createElement('div', { style: { marginBottom: 16 } },
        React.createElement('span', { style: { fontSize: 32, fontWeight: 700, color: C.wine } }, '9€'),
        React.createElement('span', { style: { fontSize: 13, color: C.wineLight } }, '/mes')
      ),
      React.createElement('button', { onClick: handleUpgrade, disabled: loading, style: { width: '100%', padding: '12px 0', borderRadius: 12, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,' + C.accent + ',' + C.accentDark + ')', color: 'white', fontSize: 14, fontWeight: 600, marginBottom: 10 } },
        loading ? 'Redirigiendo...' : 'Suscribirse ahora'
      ),
      React.createElement('button', { onClick: onClose, style: { background: 'none', border: 'none', cursor: 'pointer', color: C.wineLight, fontSize: 12 } }, 'Ahora no')
    )
  );
}

// ── PAYMENT BANNER ───────────────────────────────────────────────────────────
function PaymentSuccessBanner({ onClose }) {
  const { refreshSubscription } = useAuth();
  useEffect(function() { refreshSubscription(); }, []);
  useEffect(function() { const t = setTimeout(onClose, 7000); return function() { clearTimeout(t); }; }, []);
  return React.createElement('div', { style: { position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 9999 } },
    React.createElement('div', { style: { background: C.accent, color: C.cream, padding: '14px 24px', borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', gap: 14 } },
      React.createElement(Icon, { name: 'lightning', size: 20, color: C.gold }),
      React.createElement('div', null,
        React.createElement('p', { style: { margin: 0, fontWeight: 700, fontSize: 14 } }, 'Suscripción activada'),
        React.createElement('p', { style: { margin: 0, fontSize: 12, opacity: 0.6 } }, 'Bienvenido a PRO')
      ),
      React.createElement('button', { onClick: onClose, style: { background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(250,247,244,0.5)', marginLeft: 8 } },
        React.createElement(Icon, { name: 'x', size: 16, color: 'currentColor' })
      )
    )
  );
}

// ── SIDEBAR ──────────────────────────────────────────────────────────────────
function Sidebar({ view, setView, onShowAuth, onShowUpgrade }) {
  const { user, logout, isPro, subscription } = useAuth();
  const [hovered, setHovered] = useState(null);

  const navItems = [
    { id: 'calendar', label: 'Agenda',       icon: 'calendar' },
    { id: 'chat',     label: 'Chat IA',      icon: 'chat'     },
    { id: 'account',  label: 'Cuenta',       icon: 'user'     },
    { id: 'settings', label: 'Ajustes',      icon: 'settings' },
    { id: 'pricing',  label: 'Planes',       icon: 'star'     },
  ];

  const S = {
    aside: { width: 72, minWidth: 72, background: 'linear-gradient(180deg,' + C.sidebar + ' 0%,' + C.sidebarMid + ' 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '18px 0', boxShadow: '4px 0 20px rgba(0,0,0,0.3)', flexShrink: 0, boxSizing: 'border-box', alignSelf: 'stretch' },
    logo:  { width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg,' + C.accent + ',' + C.accentDark + ')', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    ver:   { color: C.gold, fontSize: 9, fontWeight: 600, letterSpacing: 2, opacity: 0.5, marginBottom: 14 },
    div:   { width: 36, height: 1, background: 'linear-gradient(90deg,transparent,' + C.gold + ',transparent)', opacity: 0.3, marginBottom: 14 },
    nav:   { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1, width: '100%', padding: '0 8px' },
    bottom:{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: '100%', padding: '0 8px' },
  };

  function navBtn(item) {
    const isActive = view === item.id;
    const isHov = hovered === item.id;
    return React.createElement('button', {
      key: item.id,
      onClick: function() { setView(item.id); },
      onMouseEnter: function() { setHovered(item.id); },
      onMouseLeave: function() { setHovered(null); },
      title: item.label,
      style: {
        width: '100%', padding: '9px 0', border: 'none', cursor: 'pointer', borderRadius: 12,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        background: isActive ? 'rgba(201,169,110,0.18)' : isHov ? 'rgba(255,255,255,0.06)' : 'transparent',
        color: isActive ? C.gold : isHov ? 'rgba(250,247,244,0.8)' : 'rgba(250,247,244,0.35)',
        transition: 'all 0.18s', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
      }
    },
      React.createElement(Icon, { name: item.icon, size: 17, color: 'currentColor' }),
      item.label.toUpperCase()
    );
  }

  function iconBtn(opts) {
    return React.createElement('button', {
      onClick: opts.onClick, title: opts.title,
      style: { width: 38, height: 38, borderRadius: 10, border: opts.border || 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: opts.bg || 'transparent', transition: 'all 0.18s' }
    }, React.createElement(Icon, { name: opts.icon, size: 15, color: opts.color || C.gold }));
  }

  return React.createElement('aside', { style: S.aside },
    React.createElement('div', { style: S.logo }, React.createElement(LogoIcon, { size: 22 })),
    React.createElement('span', { style: S.ver }, 'v4'),
    React.createElement('div', { style: S.div }),
    React.createElement('nav', { style: S.nav },
      navItems.map(navBtn)
    ),
    React.createElement('div', { style: S.div }),
    React.createElement('div', { style: S.bottom },
      user && isPro() && iconBtn({ icon: 'lightning', color: C.gold, title: 'PRO activo', bg: 'rgba(201,169,110,0.12)', border: '1px solid rgba(201,169,110,0.25)' }),
      user && !isPro() && iconBtn({ icon: 'lightning', color: C.gold, title: 'Actualizar a PRO', onClick: onShowUpgrade, bg: 'rgba(201,169,110,0.1)', border: '1px solid rgba(201,169,110,0.2)' }),
      user
        ? iconBtn({ icon: 'logout', color: 'rgba(250,247,244,0.3)', title: 'Cerrar sesión', onClick: logout })
        : iconBtn({ icon: 'user', color: 'white', title: 'Iniciar sesión', onClick: onShowAuth, bg: 'linear-gradient(135deg,' + C.accent + ',' + C.accentDark + ')' })
    )
  );
}

// ── RENDER MESSAGE CONTENT ───────────────────────────────────────────────────
function renderMessageContent(content) {
  if (!content) return null;
  return content.split('\n').map(function(line, i) {
    var parts = line.split(/\*\*([^*]+)\*\*/);
    var rendered = parts.map(function(p, j) { return j % 2 === 1 ? React.createElement('strong', { key: j }, p) : p; });
    return React.createElement('p', { key: i, style: { margin: i > 0 ? '4px 0 0' : 0 } }, rendered);
  });
}

// ── ACTION CARD ──────────────────────────────────────────────────────────────
function ActionCard({ actionType, summary }) {
  if (!actionType || !summary) return null;
  var cfgs = {
    event_created:  { icon: '📅', label: 'Evento creado',       bg: '#ECFDF5', border: '#6EE7B7', text: '#065F46' },
    plan_created:   { icon: '🏋', label: 'Plan creado',          bg: '#EFF6FF', border: '#93C5FD', text: '#1E40AF' },
    plan_scheduled: { icon: '📆', label: 'Sesiones programadas', bg: '#F5F3FF', border: '#C4B5FD', text: '#5B21B6' },
    event_updated:  { icon: '✏️', label: 'Evento actualizado',   bg: '#FFFBEB', border: '#FCD34D', text: '#92400E' },
    event_deleted:  { icon: '🗑', label: 'Evento eliminado',     bg: '#FEF2F2', border: '#FCA5A5', text: '#B91C1C' },
    events_listed:  { icon: '🔍', label: 'Tu agenda',            bg: C.creamDark, border: C.border, text: C.wine },
  };
  var cfg = cfgs[actionType]; if (!cfg) return null;
  var fields = Object.entries(summary).filter(function(e) { return e[1] != null && e[1] !== ''; });
  return React.createElement('div', { style: { marginTop: 8, padding: '10px 12px', borderRadius: 10, border: '1px solid ' + cfg.border, background: cfg.bg, fontSize: 11 } },
    React.createElement('div', { style: { fontWeight: 700, color: cfg.text, marginBottom: 4 } }, cfg.icon + ' ' + cfg.label),
    fields.slice(0, 4).map(function(e, i) { return React.createElement('div', { key: i, style: { color: cfg.text, opacity: 0.75 } }, e[0].replace(/_/g,' ') + ': ' + String(e[1])); })
  );
}

// ── CHAT PANEL ───────────────────────────────────────────────────────────────
function ChatPanel({ onShowUpgrade }) {
  const { user, isPro } = useAuth();
  const [messages, setMessages] = useState([{
    role: 'assistant',
    content: 'Hola! Soy tu secretario IA. Puedo ayudarte a:\n\n- Crear y organizar eventos en tu agenda\n- Planificar entrenamientos o rutinas\n- Consultar y modificar lo que tienes\n\nCuenta qué necesitas hoy.',
    suggestions: ['¿Qué tengo esta semana?', 'Crear un evento', 'Plan de 4 semanas']
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [msgCount, setMsgCount] = useState(0);
  const chatRef = useRef(null);
  const inputRef = useRef(null);
  const { show, ToastEl } = useToast();
  const FREE_LIMIT = 20;

  useEffect(function() {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, loading]);

  var sendMessage = async function(text) {
    var msgText = (text || input).trim();
    if (!msgText || loading) return;
    if (!user) { show('Inicia sesión para usar el chat', 'info'); return; }
    if (!isPro() && msgCount >= FREE_LIMIT) { onShowUpgrade && onShowUpgrade(); return; }
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setMessages(function(prev) { return prev.concat([{ role: 'user', content: msgText }]); });
    setLoading(true);
    setMsgCount(function(c) { return c + 1; });
    try {
      var data = await api.post('/api/chat', { message: msgText });
      setMessages(function(prev) { return prev.concat([{ role: 'assistant', content: data.response, intent: data.intent, action_type: data.action_type, summary: data.summary, suggestions: data.suggestions || [] }]); });
      if (data.plan && data.plan.used >= FREE_LIMIT && !isPro()) setTimeout(function() { onShowUpgrade && onShowUpgrade(); }, 1200);
    } catch(err) {
      setMessages(function(prev) { return prev.concat([{ role: 'assistant', content: 'Error al conectar. Inténtalo de nuevo.', error: true }]); });
      if (err.status === 403 && !isPro()) setTimeout(function() { onShowUpgrade && onShowUpgrade(); }, 1000);
    } finally { setLoading(false); if (inputRef.current) inputRef.current.focus(); }
  };

  var handleKey = function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } };
  var handleInputChange = function(e) {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };

  var isLimited = !isPro() && msgCount >= FREE_LIMIT;
  var usagePct = isPro() ? 100 : Math.min((msgCount / FREE_LIMIT) * 100, 100);

  if (!user) return React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: C.creamDark, gap: 16 } },
    React.createElement('div', { style: { width: 72, height: 72, borderRadius: 20, background: 'linear-gradient(135deg,' + C.accent + ',' + C.accentDark + ')', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
      React.createElement(LogoIcon, { size: 40 })
    ),
    React.createElement('h2', { style: { margin: 0, color: C.wine, fontSize: 18, fontWeight: 700 } }, 'Chat con tu IA'),
    React.createElement('p', { style: { margin: 0, color: C.wineLight, fontSize: 13 } }, 'Inicia sesión para empezar')
  );

  return React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', background: C.cream, overflow: 'hidden', height: '100%' } },
    // Header
    React.createElement('div', { style: { padding: '14px 20px', borderBottom: '1px solid ' + C.border, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.cream, boxShadow: '0 1px 6px rgba(61,12,12,0.06)', flexShrink: 0 } },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
        React.createElement('div', { style: { width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,' + C.accent + ',' + C.accentDark + ')', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
          React.createElement(LogoIcon, { size: 20 })
        ),
        React.createElement('div', null,
          React.createElement('div', { style: { fontWeight: 700, color: C.wine, fontSize: 14 } }, 'Secretario IA'),
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 5 } },
            React.createElement('div', { style: { width: 6, height: 6, borderRadius: '50%', background: C.gold } }),
            React.createElement('span', { style: { fontSize: 11, color: C.wineLight } }, 'En línea')
          )
        )
      ),
      isPro()
        ? React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 5, background: C.accent, padding: '4px 10px', borderRadius: 8 } },
            React.createElement(Icon, { name: 'lightning', size: 11, color: C.gold }),
            React.createElement('span', { style: { fontSize: 11, fontWeight: 700, color: C.gold } }, 'PRO')
          )
        : React.createElement('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 } },
            React.createElement('span', { style: { fontSize: 12, color: C.wine } }, msgCount + '/' + FREE_LIMIT + ' esta semana'),
            React.createElement('div', { style: { width: 80, height: 3, background: C.border, borderRadius: 3, overflow: 'hidden' } },
              React.createElement('div', { style: { width: usagePct + '%', height: '100%', background: usagePct >= 90 ? '#F87171' : usagePct >= 60 ? C.gold : C.accent, borderRadius: 3, transition: 'width 0.3s' } })
            )
          )
    ),

    // Messages
    React.createElement('div', { ref: chatRef, style: { flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 } },
      messages.map(function(msg, i) {
        var isUser = msg.role === 'user';
        return React.createElement('div', { key: i, style: { display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' } },
          React.createElement('div', { style: { maxWidth: '78%' } },
            React.createElement('div', { style: {
              padding: '10px 14px', borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              background: isUser ? 'linear-gradient(135deg,' + C.accent + ',' + C.accentDark + ')' : msg.error ? '#FEF2F2' : 'white',
              color: isUser ? C.cream : msg.error ? '#B91C1C' : C.wine,
              fontSize: 13, lineHeight: 1.5,
              boxShadow: isUser ? '0 2px 10px rgba(139,26,26,0.3)' : '0 1px 6px rgba(61,12,12,0.08)',
              border: isUser ? 'none' : '1px solid ' + C.borderLight,
            } },
              React.createElement('div', { style: { whiteSpace: 'pre-wrap' } }, isUser ? msg.content : renderMessageContent(msg.content))
            ),
            msg.action_type && msg.action_type !== 'error' && React.createElement(ActionCard, { actionType: msg.action_type, summary: msg.summary }),
            msg.role === 'assistant' && msg.suggestions && msg.suggestions.length > 0 && i === messages.length - 1 &&
              React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 } },
                msg.suggestions.map(function(s, si) {
                  return React.createElement('button', { key: si, onClick: function() { sendMessage(s); },
                    style: { fontSize: 11, padding: '5px 10px', borderRadius: 8, border: '1px solid ' + C.border, background: 'white', color: C.wine, cursor: 'pointer', fontWeight: 500, transition: 'all 0.15s' }
                  }, s);
                })
              )
          )
        );
      }),
      loading && React.createElement('div', { style: { display: 'flex', justifyContent: 'flex-start' } },
        React.createElement('div', { style: { padding: '10px 14px', borderRadius: '16px 16px 16px 4px', background: 'white', border: '1px solid ' + C.borderLight, boxShadow: '0 1px 6px rgba(61,12,12,0.08)', display: 'flex', gap: 4, alignItems: 'center' } },
          [0,1,2].map(function(n) { return React.createElement('div', { key: n, style: { width: 6, height: 6, borderRadius: '50%', background: C.wineMid, opacity: 0.3, animation: 'pulse 1.4s ' + (n * 0.2) + 's ease-in-out infinite' } }); }),
          React.createElement('span', { style: { fontSize: 11, color: C.wineLight, marginLeft: 4 } }, 'Pensando...')
        )
      )
    ),

    // Limit bar
    !isPro() && msgCount >= FREE_LIMIT - 3 && React.createElement('div', { style: { margin: '0 16px 8px', padding: '10px 14px', background: 'rgba(139,26,26,0.05)', border: '1px solid rgba(139,26,26,0.12)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 } },
      React.createElement('span', { style: { fontSize: 12, color: C.wine } }, isLimited ? 'Límite semanal alcanzado' : 'Quedan ' + (FREE_LIMIT - msgCount) + ' mensajes'),
      React.createElement('button', { onClick: onShowUpgrade, style: { fontSize: 12, padding: '5px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,' + C.accent + ',' + C.accentDark + ')', color: 'white', fontWeight: 600 } }, 'Ir a PRO')
    ),

    // Input
    React.createElement('div', { style: { padding: '0 16px 16px', flexShrink: 0 } },
      React.createElement('div', { style: { display: 'flex', alignItems: 'flex-end', gap: 10, background: 'white', border: '1px solid ' + C.border, borderRadius: 16, padding: '10px 10px 10px 14px', boxShadow: '0 2px 10px rgba(61,12,12,0.06)', opacity: isLimited ? 0.5 : 1 } },
        React.createElement('textarea', {
          ref: inputRef, value: input, onChange: handleInputChange, onKeyDown: handleKey,
          placeholder: isLimited ? 'Límite alcanzado. Actualiza a PRO.' : 'Escribe algo… (Enter para enviar)',
          disabled: loading || isLimited, rows: 1, maxLength: 2000,
          style: { flex: 1, background: 'transparent', border: 'none', outline: 'none', color: C.wine, fontSize: 13, resize: 'none', maxHeight: 120, lineHeight: 1.5, fontFamily: 'inherit' }
        }),
        React.createElement('button', {
          onClick: function() { sendMessage(); },
          disabled: loading || !input.trim() || isLimited,
          style: { width: 36, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,' + C.accent + ',' + C.accentDark + ')', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: (loading || !input.trim() || isLimited) ? 0.35 : 1, transition: 'opacity 0.2s' }
        }, React.createElement(Icon, { name: 'send', size: 15, color: 'white' }))
      ),
      React.createElement('p', { style: { margin: '5px 4px 0', fontSize: 10, color: C.wine, opacity: 0.25, textAlign: 'right' } }, 'Enter para enviar · Shift+Enter nueva línea')
    ),
    ToastEl
  );
}

// ── CALENDAR VIEW ────────────────────────────────────────────────────────────
function CalendarView() {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newEvent, setNewEvent] = useState({ title: '', date: '', time: '', duration_minutes: 60, event_type: 'general' });
  const { show, ToastEl } = useToast();
  const today = new Date();
  const cm = selectedDate.getMonth();
  const cy = selectedDate.getFullYear();

  useEffect(function() { if (user) fetchEvents(); }, [user, cm, cy]);

  const fetchEvents = async function() {
    setLoading(true);
    try {
      var first = new Date(cy, cm, 1).toISOString().split('T')[0];
      var last  = new Date(cy, cm + 1, 0).toISOString().split('T')[0];
      var data  = await api.get('/api/events?date_from=' + first + '&date_to=' + last);
      setEvents(data.events || []);
    } catch(e) { show(e.message, 'error'); } finally { setLoading(false); }
  };
  const createEvent = async function(e) {
    e.preventDefault();
    try { await api.post('/api/events', newEvent); show('Evento creado', 'success'); setShowForm(false); setNewEvent({ title: '', date: '', time: '', duration_minutes: 60, event_type: 'general' }); fetchEvents(); }
    catch(err) { show(err.message, 'error'); }
  };
  const deleteEvent = async function(id) {
    try { await api.del('/api/events/' + id); show('Eliminado', 'info'); fetchEvents(); }
    catch(err) { show(err.message, 'error'); }
  };

  const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const dayNames = ['Lu','Ma','Mi','Ju','Vi','Sá','Do'];
  const daysInMonth = new Date(cy, cm + 1, 0).getDate();
  const firstDay = (new Date(cy, cm, 1).getDay() + 6) % 7; // Monday=0
  const totalCells = Math.ceil((daysInMonth + firstDay) / 7) * 7;

  const getEventsForDay = function(day) {
    var ds = cy + '-' + String(cm + 1).padStart(2,'0') + '-' + String(day).padStart(2,'0');
    return events.filter(function(e) { return e.start_time && e.start_time.startsWith(ds); });
  };

  const etColors = { general: C.accent, medico: '#E11D48', trabajo: '#2563EB', personal: '#7C3AED', deporte: '#EA580C', reunion: '#D97706' };

  const selectedDayEvents = selectedDate ? getEventsForDay(selectedDate.getDate()) : [];

  const inputS = { width: '100%', background: C.creamDark, border: '1px solid ' + C.border, borderRadius: 10, padding: '10px 12px', color: C.wine, fontSize: 13, outline: 'none', boxSizing: 'border-box' };

  if (!user) return React.createElement('div', { style: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.creamDark, flexDirection: 'column', gap: 16 } },
    React.createElement('div', { style: { width: 64, height: 64, borderRadius: 18, background: 'linear-gradient(135deg,' + C.accent + ',' + C.accentDark + ')', display: 'flex', alignItems: 'center', justifyContent: 'center' } }, React.createElement(LogoIcon, { size: 34 })),
    React.createElement('h2', { style: { margin: 0, color: C.wine, fontSize: 18, fontWeight: 700 } }, 'Tu Agenda Inteligente'),
    React.createElement('p', { style: { margin: 0, color: C.wineLight, fontSize: 13 } }, 'Inicia sesión para ver tus eventos')
  );

  // Estilos reutilizables
  var btnNav = { width: 32, height: 32, borderRadius: 8, border: '1px solid ' + C.border, background: C.cream, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };

  // ── WRAPPER PRINCIPAL: sidebar ya está a la izquierda, aquí sólo el área de la vista ──
  // Estructura: [COLUMNA CALENDARIO] | [COLUMNA DÍA]
  var wrapperStyle = { display: 'flex', flexDirection: 'row', position: 'absolute', inset: 0, overflow: 'hidden', background: C.creamDark };
  var calColStyle  = { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden', padding: '20px' };

  // Cabecera mes
  var calHeader = React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexShrink: 0 } },
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
      React.createElement('button', { onClick: function() { setSelectedDate(new Date(cy, cm - 1, 1)); }, style: btnNav },
        React.createElement(Icon, { name: 'chevLeft', size: 16, color: C.wine })
      ),
      React.createElement('h2', { style: { margin: 0, color: C.wine, fontSize: 20, fontWeight: 700, minWidth: 180 } }, months[cm] + ' ' + cy),
      React.createElement('button', { onClick: function() { setSelectedDate(new Date(cy, cm + 1, 1)); }, style: btnNav },
        React.createElement(Icon, { name: 'chevRight', size: 16, color: C.wine })
      )
    ),
    React.createElement('div', { style: { display: 'flex', gap: 8 } },
      React.createElement('button', { onClick: function() { setSelectedDate(new Date()); },
        style: { padding: '7px 14px', borderRadius: 8, border: '1px solid ' + C.border, background: C.cream, color: C.wine, fontSize: 13, fontWeight: 500, cursor: 'pointer' }
      }, 'Hoy'),
      React.createElement('button', { onClick: function() { setShowForm(true); },
        style: { display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,' + C.accent + ',' + C.accentDark + ')', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
      }, React.createElement(Icon, { name: 'plus', size: 14, color: 'white' }), 'Nuevo evento')
    )
  );

  // Cabecera días semana
  var calDayNames = React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 4, flexShrink: 0 } },
    dayNames.map(function(d, di) {
      var isWknd = di === 5 || di === 6;
      return React.createElement('div', { key: d, style: { textAlign: 'center', fontSize: 11, fontWeight: 700, color: isWknd ? C.wineMid : C.wineMid, padding: '3px 0', letterSpacing: '0.07em', opacity: isWknd ? 0.4 : 0.45 } }, d);
    })
  );

  // Grid celdas — gridTemplateRows calculado para que las filas llenen el espacio
  var numRows = totalCells / 7;
  var calGrid = React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridTemplateRows: 'repeat(' + numRows + ', 1fr)', gap: 3, flex: 1, minHeight: 0 } },
    Array.from({ length: totalCells }, function(_, i) {
      var day = i - firstDay + 1;
      var isValid  = day >= 1 && day <= daysInMonth;
      var isToday  = isValid && day === today.getDate() && cm === today.getMonth() && cy === today.getFullYear();
      var isSelected = isValid && day === selectedDate.getDate() && cm === selectedDate.getMonth() && cy === selectedDate.getFullYear();
      var dayOfWeek  = i % 7;
      var isWeekend  = dayOfWeek === 5 || dayOfWeek === 6;
      var dayEvents  = isValid ? getEventsForDay(day) : [];

      var cellBg = !isValid ? 'transparent'
        : isSelected ? 'linear-gradient(135deg,' + C.accent + ' 0%,' + C.accentDark + ' 100%)'
        : isToday    ? '#FFFFFF'
        : isWeekend  ? '#E8DDD4'
        : '#F5F0EB';

      var cellBorder = !isValid ? 'transparent'
        : isSelected ? C.accentDark
        : isToday    ? C.gold
        : isWeekend  ? '#CFC6BC'
        : '#E2D9D0';

      return React.createElement('div', {
        key: i,
        onClick: function() { if (isValid) setSelectedDate(new Date(cy, cm, day)); },
        style: {
          background: cellBg,
          border: '1px solid ' + cellBorder,
          borderRadius: 8,
          padding: '5px 6px',
          cursor: isValid ? 'pointer' : 'default',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transition: 'box-shadow 0.15s',
          visibility: isValid ? 'visible' : 'hidden',
        }
      },
        isValid && React.createElement(React.Fragment, null,
          React.createElement('div', { style: { marginBottom: 2, flexShrink: 0 } },
            isToday && !isSelected
              ? React.createElement('div', { style: { width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg,' + C.accent + ',' + C.accentDark + ')', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
                  React.createElement('span', { style: { fontSize: 11, fontWeight: 700, color: 'white' } }, day)
                )
              : React.createElement('span', { style: { fontSize: 12, fontWeight: isSelected || isToday ? 700 : 500, color: isSelected ? 'rgba(250,247,244,0.95)' : C.wine } }, day)
          ),
          React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden', flex: 1 } },
            dayEvents.slice(0, 2).map(function(ev, idx) {
              return React.createElement('div', { key: idx, style: {
                fontSize: 9, padding: '1px 5px', borderRadius: 4,
                background: isSelected ? 'rgba(255,255,255,0.22)' : (etColors[ev.event_type] || C.accent),
                color: isSelected ? C.cream : 'white',
                fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
              } }, ev.title);
            }),
            dayEvents.length > 2 && React.createElement('span', { style: { fontSize: 9, color: isSelected ? 'rgba(250,247,244,0.55)' : C.wineLight } }, '+' + (dayEvents.length - 2))
          )
        )
      );
    })
  );

  // ── COLUMNA DERECHA: panel día ──
  var dayPanelStyle = { width: 252, minWidth: 252, flexShrink: 0, display: 'flex', flexDirection: 'column', background: C.cream, borderLeft: '1px solid ' + C.border, overflow: 'hidden' };

  var dayPanel = React.createElement('div', { style: dayPanelStyle },
    // Cabecera panel día
    React.createElement('div', { style: { padding: '18px 16px 14px', borderBottom: '1px solid ' + C.border, background: C.creamDark, flexShrink: 0 } },
      React.createElement('p', { style: { margin: '0 0 2px', color: C.wine, fontSize: 14, fontWeight: 700, textTransform: 'capitalize' } },
        selectedDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
      ),
      React.createElement('p', { style: { margin: 0, color: C.wineLight, fontSize: 12 } },
        selectedDayEvents.length === 0 ? 'Sin eventos' : selectedDayEvents.length + ' evento' + (selectedDayEvents.length !== 1 ? 's' : '')
      )
    ),
    // Lista eventos
    React.createElement('div', { style: { flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 } },
      selectedDayEvents.length === 0
        ? React.createElement('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, opacity: 0.25, gap: 8 } },
            React.createElement(Icon, { name: 'calendar', size: 30, color: C.wine }),
            React.createElement('p', { style: { margin: 0, fontSize: 12, color: C.wine } }, 'Día libre')
          )
        : selectedDayEvents.map(function(ev) {
            return React.createElement('div', { key: ev.id, style: { background: C.creamDark, borderRadius: 12, padding: '10px 12px', border: '1px solid ' + C.border } },
              React.createElement('div', { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 } },
                React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                  React.createElement('div', { style: { display: 'inline-block', fontSize: 9, padding: '2px 7px', borderRadius: 20, fontWeight: 700, marginBottom: 5, background: etColors[ev.event_type] || C.accent, color: 'white', letterSpacing: '0.05em' } }, (ev.event_type || 'general').toUpperCase()),
                  React.createElement('p', { style: { margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: C.wine, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, ev.title),
                  React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
                    React.createElement(Icon, { name: 'clock', size: 10, color: C.wineLight }),
                    React.createElement('span', { style: { fontSize: 11, color: C.wineLight } },
                      new Date(ev.start_time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
                      ev.duration_minutes ? ' · ' + ev.duration_minutes + ' min' : ''
                    )
                  )
                ),
                React.createElement('button', {
                  onClick: function() { deleteEvent(ev.id); },
                  style: { width: 26, height: 26, borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
                  onMouseEnter: function(e) { e.currentTarget.style.background = '#FEF2F2'; },
                  onMouseLeave: function(e) { e.currentTarget.style.background = 'transparent'; }
                }, React.createElement(Icon, { name: 'trash', size: 12, color: '#EF4444' }))
              )
            );
          })
    )
  );

  // ── MODAL NUEVO EVENTO ──
  var eventModal = showForm && React.createElement('div', {
    style: { position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(61,12,12,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    onClick: function(e) { if (e.target === e.currentTarget) setShowForm(false); }
  },
    React.createElement('div', { style: { background: C.cream, borderRadius: 22, padding: 28, width: 400, boxShadow: '0 20px 60px rgba(61,12,12,0.22)', border: '1px solid ' + C.border } },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 } },
        React.createElement('h3', { style: { margin: 0, color: C.wine, fontSize: 17, fontWeight: 700 } }, 'Nuevo evento'),
        React.createElement('button', { onClick: function() { setShowForm(false); }, style: { width: 30, height: 30, borderRadius: 8, border: 'none', background: C.panel, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
          React.createElement(Icon, { name: 'x', size: 14, color: C.wine })
        )
      ),
      React.createElement('form', { onSubmit: createEvent, style: { display: 'flex', flexDirection: 'column', gap: 10 } },
        React.createElement('input', { required: true, placeholder: 'Título del evento', value: newEvent.title, onChange: function(e) { setNewEvent(function(p) { return Object.assign({}, p, { title: e.target.value }); }); }, style: inputS }),
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 } },
          React.createElement('input', { required: true, type: 'date', value: newEvent.date, onChange: function(e) { setNewEvent(function(p) { return Object.assign({}, p, { date: e.target.value }); }); }, style: inputS }),
          React.createElement('input', { required: true, type: 'time', value: newEvent.time, onChange: function(e) { setNewEvent(function(p) { return Object.assign({}, p, { time: e.target.value }); }); }, style: inputS })
        ),
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 } },
          React.createElement('input', { type: 'number', placeholder: 'Duración (min)', value: newEvent.duration_minutes, onChange: function(e) { setNewEvent(function(p) { return Object.assign({}, p, { duration_minutes: parseInt(e.target.value) }); }); }, style: inputS }),
          React.createElement('select', { value: newEvent.event_type, onChange: function(e) { setNewEvent(function(p) { return Object.assign({}, p, { event_type: e.target.value }); }); }, style: inputS },
            ['general','medico','trabajo','personal','deporte','reunion'].map(function(t) { return React.createElement('option', { key: t, value: t }, t.charAt(0).toUpperCase() + t.slice(1)); })
          )
        ),
        React.createElement('div', { style: { display: 'flex', gap: 10, marginTop: 6 } },
          React.createElement('button', { type: 'button', onClick: function() { setShowForm(false); }, style: { flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid ' + C.border, background: 'transparent', color: C.wine, fontSize: 13, fontWeight: 500, cursor: 'pointer' } }, 'Cancelar'),
          React.createElement('button', { type: 'submit', style: { flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,' + C.accent + ',' + C.accentDark + ')', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' } }, 'Crear evento')
        )
      )
    )
  );

  return React.createElement('div', { style: wrapperStyle },
    // Columna calendario
    React.createElement('div', { style: calColStyle },
      calHeader,
      calDayNames,
      calGrid
    ),
    // Columna día
    dayPanel,
    // Modal
    eventModal,
    ToastEl
  );
}

// ── PRICING PAGE ─────────────────────────────────────────────────────────────
function PricingPage({ onShowAuth, onShowUpgrade }) {
  const { user, isPro, subscription, refreshSubscription } = useAuth();
  const [loadingPlan, setLoadingPlan] = useState('');
  const { show, ToastEl } = useToast();
  useEffect(function() { if (user) refreshSubscription(); }, [user]);

  const plans = [
    { id: 'free', name: 'Gratuito', price: '0', period: 'para siempre', badge: null,
      features: [{ok:true,text:'20 mensajes/semana'},{ok:true,text:'20 eventos'},{ok:true,text:'Creación básica'},{ok:false,text:'Planes con IA'},{ok:false,text:'Memoria personalizada'}],
      cta: 'Empezar gratis', border: C.border, ctaBg: 'transparent', ctaColor: C.wine, ctaBorder: C.border },
    { id: 'pro', name: 'PRO', price: '9', period: '/mes', badge: 'Más popular',
      features: [{ok:true,text:'IA ilimitada'},{ok:true,text:'Eventos ilimitados'},{ok:true,text:'Planes de entrenamiento'},{ok:true,text:'Memoria personalizada'},{ok:true,text:'Emails de confirmación'}],
      cta: 'Suscribirse', border: C.accent, ctaBg: 'linear-gradient(135deg,' + C.accent + ',' + C.accentDark + ')', ctaColor: 'white', ctaBorder: 'none' },
    { id: 'premium', name: 'Premium', price: '19', period: '/mes', badge: 'Próximamente',
      features: [{ok:true,text:'Todo PRO'},{ok:true,text:'Google Calendar'},{ok:true,text:'SMS/WhatsApp'},{ok:true,text:'Múltiples usuarios'}],
      cta: 'Lista de espera', border: C.borderLight, ctaBg: 'transparent', ctaColor: C.wineLight, ctaBorder: C.borderLight },
  ];

  const handleSubscribe = async function(planId) {
    if (planId === 'free') { if (!user) onShowAuth(); return; }
    if (planId === 'premium') { show('Te avisamos cuando esté disponible', 'success'); return; }
    if (!user) { onShowAuth(); return; }
    if (isPro()) { show('Ya tienes el plan PRO activo', 'info'); return; }
    setLoadingPlan(planId);
    try { const data = await api.get('/api/stripe/checkout'); if (data.url) window.location.href = data.url; }
    catch(err) { show('Error al procesar el pago.', 'error'); }
    finally { setLoadingPlan(''); }
  };

  return React.createElement('div', { style: { flex: 1, overflowY: 'auto', background: C.creamDark, padding: '40px 32px' } },
    React.createElement('div', { style: { textAlign: 'center', marginBottom: 40 } },
      React.createElement('h2', { style: { margin: '0 0 8px', color: C.wine, fontSize: 28, fontWeight: 700 } }, 'Elige tu plan'),
      React.createElement('p', { style: { margin: 0, color: C.wineLight, fontSize: 14 } }, 'Sin compromisos · Cancela cuando quieras')
    ),
    React.createElement('div', { style: { display: 'flex', gap: 20, maxWidth: 900, margin: '0 auto', justifyContent: 'center', flexWrap: 'wrap' } },
      plans.map(function(plan) {
        var isCurrent = (plan.id === 'free' && !isPro()) || (plan.id === 'pro' && isPro());
        return React.createElement('div', { key: plan.id, style: { background: C.cream, borderRadius: 20, padding: 28, width: 260, border: '2px solid ' + (isCurrent ? C.gold : plan.border), position: 'relative', boxShadow: plan.id === 'pro' ? '0 8px 32px rgba(139,26,26,0.15)' : '0 2px 12px rgba(61,12,12,0.07)', transform: plan.id === 'pro' ? 'scale(1.03)' : 'none', display: 'flex', flexDirection: 'column' } },
          plan.badge && React.createElement('div', { style: { position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', padding: '3px 14px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: plan.id === 'pro' ? 'linear-gradient(135deg,' + C.accent + ',' + C.accentDark + ')' : C.panel, color: plan.id === 'pro' ? 'white' : C.wine, whiteSpace: 'nowrap' } }, plan.badge),
          isCurrent && React.createElement('div', { style: { position: 'absolute', top: -12, right: 16, padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: '#10B981', color: 'white' } }, 'Tu plan'),
          React.createElement('h3', { style: { margin: '0 0 8px', color: C.wine, fontSize: 16, fontWeight: 700 } }, plan.name),
          React.createElement('div', { style: { marginBottom: 16 } },
            React.createElement('span', { style: { fontSize: 36, fontWeight: 700, color: C.wine } }, plan.price + '€'),
            React.createElement('span', { style: { fontSize: 13, color: C.wineLight } }, plan.period)
          ),
          React.createElement('ul', { style: { margin: '0 0 20px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 } },
            plan.features.map(function(f, i) {
              return React.createElement('li', { key: i, style: { display: 'flex', alignItems: 'center', gap: 8 } },
                React.createElement('div', { style: { width: 16, height: 16, borderRadius: '50%', background: f.ok ? 'linear-gradient(135deg,' + C.accent + ',' + C.accentDark + ')' : C.panel, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } },
                  f.ok ? React.createElement(Icon, { name: 'check', size: 8, color: 'white' }) : React.createElement('span', { style: { color: C.wineLight, fontSize: 8, fontWeight: 700 } }, '×')
                ),
                React.createElement('span', { style: { fontSize: 12, color: f.ok ? C.wine : C.wineLight, textDecoration: f.ok ? 'none' : 'line-through' } }, f.text)
              );
            })
          ),
          React.createElement('button', { onClick: function() { handleSubscribe(plan.id); }, disabled: loadingPlan === plan.id || isCurrent,
            style: { width: '100%', padding: '10px 0', borderRadius: 10, border: '1px solid ' + plan.ctaBorder, background: plan.ctaBg, color: plan.ctaColor, fontSize: 13, fontWeight: 600, cursor: isCurrent ? 'default' : 'pointer', opacity: isCurrent ? 0.6 : 1 }
          }, loadingPlan === plan.id ? 'Procesando...' : isCurrent ? 'Plan actual' : plan.cta)
        );
      })
    ),
    ToastEl
  );
}

// ── ACCOUNT PAGE ─────────────────────────────────────────────────────────────
function AccountPage({ onShowAuth }) {
  const { user, logout, isPro, subscription, refreshSubscription } = useAuth();
  const [portalLoading, setPortalLoading] = useState(false);
  useEffect(function() { if (user) refreshSubscription(); }, [user]);

  const openPortal = async function() {
    setPortalLoading(true);
    try { const data = await api.get('/api/stripe/portal'); if (data.url) window.open(data.url, '_blank'); }
    catch(e) { alert('Error al abrir el portal.'); }
    finally { setPortalLoading(false); }
  };

  if (!user) return React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: C.creamDark, gap: 16 } },
    React.createElement('div', { style: { width: 64, height: 64, borderRadius: 18, background: 'linear-gradient(135deg,' + C.accent + ',' + C.accentDark + ')', display: 'flex', alignItems: 'center', justifyContent: 'center' } }, React.createElement(LogoIcon, { size: 34 })),
    React.createElement('h2', { style: { margin: 0, color: C.wine, fontSize: 18, fontWeight: 700 } }, 'Tu cuenta'),
    React.createElement('p', { style: { margin: 0, color: C.wineLight, fontSize: 13 } }, 'Inicia sesión para ver tu cuenta'),
    React.createElement('button', { onClick: onShowAuth, style: { padding: '10px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,' + C.accent + ',' + C.accentDark + ')', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' } }, 'Iniciar sesión')
  );

  const periodEnd = subscription && subscription.periodEnd ? new Date(subscription.periodEnd).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

  return React.createElement('div', { style: { flex: 1, overflowY: 'auto', background: C.creamDark, padding: '40px 32px' } },
    React.createElement('h2', { style: { margin: '0 0 24px', color: C.wine, fontSize: 22, fontWeight: 700 } }, 'Mi cuenta'),
    React.createElement('div', { style: { maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 16 } },
      React.createElement('div', { style: { background: C.cream, borderRadius: 16, padding: 24, border: '1px solid ' + C.border } },
        React.createElement('h3', { style: { margin: '0 0 16px', color: C.wine, fontSize: 14, fontWeight: 700, opacity: 0.5, letterSpacing: '0.08em' } }, 'PERFIL'),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 14 } },
          React.createElement('div', { style: { width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg,' + C.accent + ',' + C.accentDark + ')', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
            React.createElement('span', { style: { color: 'white', fontSize: 18, fontWeight: 700 } }, user.name ? user.name[0].toUpperCase() : '?')
          ),
          React.createElement('div', null,
            React.createElement('p', { style: { margin: '0 0 2px', fontWeight: 700, color: C.wine, fontSize: 15 } }, user.name),
            React.createElement('p', { style: { margin: 0, color: C.wineLight, fontSize: 13 } }, user.email)
          )
        )
      ),
      React.createElement('div', { style: { background: C.cream, borderRadius: 16, padding: 24, border: '1px solid ' + C.border } },
        React.createElement('h3', { style: { margin: '0 0 16px', color: C.wine, fontSize: 14, fontWeight: 700, opacity: 0.5, letterSpacing: '0.08em' } }, 'SUSCRIPCIÓN'),
        isPro()
          ? React.createElement('div', null,
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 } },
                React.createElement(Icon, { name: 'lightning', size: 16, color: C.gold }),
                React.createElement('span', { style: { fontWeight: 700, color: C.wine } }, 'Plan PRO activo'),
                React.createElement('span', { style: { padding: '2px 8px', borderRadius: 6, background: '#10B981', color: 'white', fontSize: 10, fontWeight: 700 } }, subscription && subscription.status === 'trial' ? 'Trial' : 'Activo')
              ),
              periodEnd && React.createElement('p', { style: { margin: '0 0 14px', fontSize: 12, color: C.wineLight } }, (subscription && subscription.cancelAtPeriodEnd ? 'Se cancela el ' : 'Próxima renovación: ') + periodEnd),
              React.createElement('button', { onClick: openPortal, disabled: portalLoading, style: { padding: '8px 16px', borderRadius: 8, border: '1px solid ' + C.border, background: 'transparent', color: C.wine, fontSize: 13, fontWeight: 500, cursor: 'pointer' } }, portalLoading ? 'Cargando...' : 'Gestionar suscripción')
            )
          : React.createElement('div', null,
              React.createElement('p', { style: { margin: '0 0 12px', color: C.wine, fontSize: 13 } }, 'Plan Gratuito — 20 mensajes/semana'),
              React.createElement('button', { style: { padding: '8px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,' + C.accent + ',' + C.accentDark + ')', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' } }, 'Actualizar a PRO — 9€/mes')
            )
      ),
      React.createElement('button', { onClick: logout, style: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10, border: '1px solid ' + C.border, background: C.cream, color: C.wineLight, fontSize: 13, fontWeight: 500, cursor: 'pointer', alignSelf: 'flex-start' } },
        React.createElement(Icon, { name: 'logout', size: 14, color: C.wineLight }), 'Cerrar sesión'
      )
    )
  );
}

// ── SETTINGS PAGE ────────────────────────────────────────────────────────────
function SettingsPage() {
  return React.createElement('div', { style: { flex: 1, overflowY: 'auto', background: C.creamDark, padding: '40px 32px' } },
    React.createElement('h2', { style: { margin: '0 0 24px', color: C.wine, fontSize: 22, fontWeight: 700 } }, 'Ajustes'),
    React.createElement('div', { style: { maxWidth: 480, background: C.cream, borderRadius: 16, padding: 24, border: '1px solid ' + C.border } },
      React.createElement('p', { style: { color: C.wineLight, fontSize: 13 } }, 'Los ajustes avanzados estarán disponibles próximamente.')
    )
  );
}

// ── APP ROOT ─────────────────────────────────────────────────────────────────
function App() {
  const { user, loading, refreshSubscription } = useAuth();
  const [view, setView] = useState('calendar');
  const [showAuth, setShowAuth] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showPaymentBanner, setShowPaymentBanner] = useState(false);

  useEffect(function() {
    var params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') { setShowPaymentBanner(true); window.history.replaceState({}, '', window.location.pathname); }
    if (params.get('payment') === 'cancel')  { window.history.replaceState({}, '', window.location.pathname); }
  }, []);
  useEffect(function() { if (user) refreshSubscription(); }, [user]);

  if (loading) return React.createElement('div', { style: { height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.creamDark } },
    React.createElement('div', { style: { textAlign: 'center' } },
      React.createElement('div', { style: { width: 52, height: 52, borderRadius: 16, background: 'linear-gradient(135deg,' + C.accent + ',' + C.accentDark + ')', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' } },
        React.createElement(LogoIcon, { size: 28 })
      ),
      React.createElement('p', { style: { color: C.wineLight, fontSize: 13 } }, 'Cargando...')
    )
  );

  var renderView = function() {
    if (view === 'calendar') return React.createElement(CalendarView);
    if (view === 'chat')     return React.createElement(ChatPanel, { onShowUpgrade: function() { setShowUpgrade(true); } });
    if (view === 'account')  return React.createElement(AccountPage, { onShowAuth: function() { setShowAuth(true); } });
    if (view === 'settings') return React.createElement(SettingsPage);
    if (view === 'pricing')  return React.createElement(PricingPage, { onShowAuth: function() { setShowAuth(true); }, onShowUpgrade: function() { setShowUpgrade(true); } });
    return React.createElement(CalendarView);
  };

  return React.createElement('div', { style: { height: '100vh', width: '100vw', display: 'flex', overflow: 'hidden', fontFamily: "'Inter', system-ui, sans-serif", position: 'relative' } },
    React.createElement(Sidebar, { view, setView, onShowAuth: function() { setShowAuth(true); }, onShowUpgrade: function() { setShowUpgrade(true); } }),
    React.createElement('main', { style: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, position: 'relative' } },
      React.createElement('div', { style: { position: 'absolute', inset: 0, display: 'flex', overflow: 'hidden' } }, renderView())
    ),
    showAuth && !user && React.createElement(AuthModal, { onClose: function() { setShowAuth(false); } }),
    showUpgrade && !user && React.createElement(UpgradeModal, { onClose: function() { setShowUpgrade(false); }, onShowAuth: function() { setShowUpgrade(false); setShowAuth(true); } }),
    showUpgrade && user  && React.createElement(UpgradeModal, { onClose: function() { setShowUpgrade(false); } }),
    showPaymentBanner && React.createElement(PaymentSuccessBanner, { onClose: function() { setShowPaymentBanner(false); } })
  );
}

const root = ReactDOM.createRoot(document.getElementById('app'));
root.render(React.createElement(AuthProvider, null, React.createElement(App)));
