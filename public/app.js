// SECRETARIO IA — React Frontend v3.3 (Premium UI)
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
function LogoIcon({ size, className }) {
  size = size || 36; className = className || '';
  return React.createElement('svg', { width: size, height: size, viewBox: '0 0 200 200', className, xmlns: 'http://www.w3.org/2000/svg' },
    React.createElement('circle', { cx: 100, cy: 100, r: 95, fill: 'none', stroke: 'currentColor', strokeWidth: 10 }),
    React.createElement('rect', { x: 38, y: 38, width: 124, height: 124, rx: 8, fill: 'none', stroke: 'currentColor', strokeWidth: 10 }),
    React.createElement('path', { d: 'M100 38 A62 62 0 0 1 162 100', fill: 'none', stroke: 'currentColor', strokeWidth: 10, strokeLinecap: 'round' }),
    React.createElement('path', { d: 'M38 100 A62 62 0 0 0 100 162', fill: 'none', stroke: 'currentColor', strokeWidth: 10, strokeLinecap: 'round' })
  );
}
const Icon = function({ name, size, className }) {
  size = size || 18; className = className || '';
  const icons = {
    calendar:   'M8 2a1 1 0 0 0-2 0v1H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-1V2a1 1 0 0 0-2 0v1H8V2zM5 7h10v9H5V7z',
    chat:       'M2 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V5z',
    plus:       'M12 5v14M5 12h14',
    send:       'M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z',
    user:       'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    star:       'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
    check:      'M20 6L9 17l-5-5',
    logout:     'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1',
    clock:      'M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zM12 6v6l4 2',
    trash:      'M3 6h18M8 6V4h8v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6',
    lightning:  'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
    alert:      'M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
    chevronDown:'M6 9l6 6 6-6',
    x:          'M18 6L6 18M6 6l12 12',
    settings:   'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm6.93-3a7 7 0 0 0-.06-.9l1.96-1.53-1.87-3.24-2.3.93a7 7 0 0 0-1.56-.9L14.5 5h-4l-.6 2.36a7 7 0 0 0-1.56.9l-2.3-.93L4.17 10.6l1.96 1.53a7 7 0 0 0 0 1.8L4.17 15.4l1.87 3.24 2.3-.93a7 7 0 0 0 1.56.9L10.5 21h4l.6-2.36a7 7 0 0 0 1.56-.9l2.3.93 1.87-3.24-1.96-1.53a7 7 0 0 0 .06-.9z',
    creditCard: 'M1 4h22v16H1zM1 10h22'
  };
  return React.createElement('svg', { width: size, height: size, viewBox: '0 0 24 24', className, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
    React.createElement('path', { d: icons[name] || icons.star }));
};
function Toast({ message, type, onClose }) {
  useEffect(function() { const t = setTimeout(onClose, 4000); return function() { clearTimeout(t); }; }, []);
  const styles = {
    success: 'bg-wine text-cream border-l-4 border-gold',
    error:   'bg-red-900 text-cream border-l-4 border-red-400',
    info:    'bg-wine text-cream border-l-4 border-gold'
  };
  return React.createElement('div', { className: 'fixed bottom-6 right-6 z-50 px-5 py-3.5 rounded-2xl shadow-premium-lg text-sm font-medium fade-in flex items-center gap-3 ' + (styles[type] || styles.info) },
    React.createElement('div', { className: 'w-1.5 h-1.5 rounded-full bg-gold flex-shrink-0' }),
    message
  );
}
function useToast() {
  const [toast, setToast] = useState(null);
  const show = function(message, type) { setToast({ message, type: type || 'info', id: Date.now() }); };
  const hide = function() { setToast(null); };
  const ToastEl = toast ? React.createElement(Toast, Object.assign({}, toast, { onClose: hide })) : null;
  return { show, ToastEl };
}
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
  const inputClass = 'w-full bg-cream-dark border border-border rounded-xl px-4 py-3 text-wine placeholder-wine-light/40 text-sm focus:border-accent focus:ring-2 focus:ring-accent/15 transition-all';
  return React.createElement('div', { className: 'fixed inset-0 z-50 flex items-center justify-center modal-overlay bg-wine/20', onClick: function(e) { if (e.target === e.currentTarget) onClose(); } },
    React.createElement('div', { className: 'bg-cream rounded-3xl p-8 w-full max-w-md shadow-premium-lg slide-up border border-border/60' },
      React.createElement('div', { className: 'text-center mb-8' },
        React.createElement('div', { className: 'w-16 h-16 rounded-2xl gradient-accent flex items-center justify-center mx-auto mb-4' }, React.createElement(LogoIcon, { size: 36, className: 'text-white' })),
        React.createElement('h2', { className: 'text-2xl font-bold text-wine tracking-tight' }, 'Secretario IA'),
        React.createElement('p', { className: 'text-wine-light text-sm mt-1 font-light' }, 'Tu agenda inteligente')
      ),
      React.createElement('div', { className: 'flex bg-panel rounded-2xl p-1 mb-6 gap-1' },
        ['login','register'].map(function(m) {
          return React.createElement('button', { key: m, onClick: function() { setMode(m); setError(''); },
            className: 'flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ' + (mode === m ? 'bg-white text-wine shadow-sm' : 'text-wine-light hover:text-wine')
          }, m === 'login' ? 'Iniciar sesión' : 'Registrarse');
        })
      ),
      React.createElement('form', { onSubmit: handleSubmit, className: 'space-y-4' },
        mode === 'register' && React.createElement('div', null,
          React.createElement('label', { className: 'block text-[11px] font-semibold text-wine-light mb-1.5 uppercase tracking-widest' }, 'Nombre'),
          React.createElement('input', { type: 'text', value: name, onChange: function(e) { setName(e.target.value); }, placeholder: 'Tu nombre', className: inputClass })
        ),
        React.createElement('div', null,
          React.createElement('label', { className: 'block text-[11px] font-semibold text-wine-light mb-1.5 uppercase tracking-widest' }, 'Email'),
          React.createElement('input', { type: 'email', value: email, onChange: function(e) { setEmail(e.target.value); }, placeholder: 'tu@email.com', className: inputClass })
        ),
        error && React.createElement('div', { className: 'flex items-center gap-2 text-red-700 text-sm bg-red-50 px-4 py-3 rounded-xl border border-red-200' },
          React.createElement(Icon, { name: 'alert', size: 14, className: 'flex-shrink-0' }), error
        ),
        React.createElement('button', { type: 'submit', disabled: loading, className: 'w-full gradient-accent text-white py-3.5 rounded-xl font-semibold text-sm hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 mt-2' },
          loading ? 'Cargando...' : mode === 'login' ? 'Entrar' : 'Crear cuenta'
        )
      ),
      React.createElement('div', { className: 'gold-divider mt-6 mb-4' }),
      React.createElement('p', { className: 'text-center text-xs text-wine/40 font-light' }, 'Acceso seguro sin contraseña • Solo tu email')
    )
  );
}
function UpgradeModal({ onClose, onShowAuth }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const handleUpgrade = async function() {
    if (!user) { onClose(); onShowAuth && onShowAuth(); return; }
    setLoading(true);
    try { const data = await api.get('/api/stripe/checkout'); if (data.url) window.location.href = data.url; }
    catch(err) { alert('Error al procesar el pago. Inténtalo de nuevo.'); }
    finally { setLoading(false); }
  };
  const features = ['IA ilimitada sin restricciones semanales', 'Eventos ilimitados en tu agenda', 'Planes de entrenamiento con IA', 'Memoria personalizada a largo plazo', 'Emails de confirmación automáticos'];
  return React.createElement('div', { className: 'fixed inset-0 z-50 flex items-center justify-center modal-overlay bg-wine/25', onClick: function(e) { if (e.target === e.currentTarget) onClose(); } },
    React.createElement('div', { className: 'bg-cream rounded-3xl p-8 w-full max-w-sm shadow-premium-lg slide-up border border-border/60 text-center' },
      React.createElement('div', { className: 'w-16 h-16 rounded-2xl gradient-accent flex items-center justify-center mx-auto mb-5' }, React.createElement(Icon, { name: 'lightning', size: 30, className: 'text-white' })),
      React.createElement('h3', { className: 'text-xl font-bold text-wine mb-1 tracking-tight' }, 'Secretario PRO'),
      React.createElement('p', { className: 'text-wine-light text-sm mb-6 font-light' }, 'Desbloquea todo el potencial de tu IA personal'),
      React.createElement('div', { className: 'bg-panel rounded-2xl p-4 mb-6 text-left space-y-3' },
        features.map(function(f, i) {
          return React.createElement('div', { key: i, className: 'flex items-center gap-3' },
            React.createElement('div', { className: 'w-5 h-5 rounded-full gradient-accent flex items-center justify-center flex-shrink-0' }, React.createElement(Icon, { name: 'check', size: 10, className: 'text-white' })),
            React.createElement('span', { className: 'text-sm text-wine font-medium' }, f)
          );
        })
      ),
      React.createElement('div', { className: 'mb-4' },
        React.createElement('div', { className: 'flex items-baseline justify-center gap-1 mb-1' },
          React.createElement('span', { className: 'text-3xl font-bold text-wine' }, '9' + String.fromCharCode(8364)),
          React.createElement('span', { className: 'text-wine-light text-sm' }, '/mes')
        ),
        React.createElement('p', { className: 'text-xs text-wine/40' }, 'Sin permanencia • Cancela cuando quieras')
      ),
      React.createElement('button', { onClick: handleUpgrade, disabled: loading, className: 'w-full gradient-accent text-white py-3.5 rounded-xl font-bold text-sm hover:opacity-90 transition-all disabled:opacity-50 mb-3' },
        loading ? 'Redirigiendo...' : 'Suscribirse ahora'
      ),
      React.createElement('button', { onClick: onClose, className: 'w-full text-wine/40 text-xs hover:text-wine transition-all py-1' }, 'Ahora no')
    )
  );
}
function Sidebar({ view, setView, onShowAuth, onShowUpgrade }) {
  const { user, logout, isPro, subscription } = useAuth();
  const [portalLoading, setPortalLoading] = useState(false);
  const navItems = [
    { id: 'calendar', label: 'Agenda', icon: 'calendar' },
    { id: 'chat',     label: 'IA',     icon: 'chat' },
    { id: 'pricing',  label: 'Planes', icon: 'star' },
  ];
  const openPortal = async function() {
    setPortalLoading(true);
    try { const data = await api.get('/api/stripe/portal'); if (data.url) window.open(data.url, '_blank'); }
    catch(err) { alert('Error al abrir el portal de facturación.'); }
    finally { setPortalLoading(false); }
  };
  const sidebarStyle = {
    width: '64px', minWidth: '64px', height: '100%',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '16px 0', flexShrink: 0,
    background: 'linear-gradient(180deg, #1E0A0A, #2D1010)',
    boxShadow: '4px 0 24px rgba(0,0,0,0.25)'
  };
  const navStyle = { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', width: '100%', padding: '0 8px' };
  const bottomStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '100%', padding: '0 8px' };
  const btnBase = { width: '44px', height: '44px', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', cursor: 'pointer', border: 'none', transition: 'all 0.2s', fontSize: '9px', fontWeight: '700', letterSpacing: '0.05em', background: 'transparent', padding: 0 };
  const iconBtnBase = { width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: 'none', transition: 'all 0.2s', background: 'transparent' };

  return React.createElement('aside', { style: sidebarStyle },
    /* Logo */
    React.createElement('div', { style: { marginBottom: '16px' } },
      React.createElement('div', { className: 'gradient-accent', style: { width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
        React.createElement(LogoIcon, { size: 20, className: 'text-white' })
      )
    ),
    React.createElement('div', { className: 'gold-divider', style: { width: '32px', marginBottom: '12px' } }),

    /* Nav items */
    React.createElement('nav', { style: navStyle },
      navItems.map(function(item) {
        const isActive = view === item.id;
        return React.createElement('button', {
          key: item.id,
          onClick: function() { setView(item.id); },
          title: item.label,
          style: Object.assign({}, btnBase, isActive
            ? { color: '#C9A96E', background: 'rgba(201,169,110,0.15)' }
            : { color: 'rgba(250,247,244,0.4)' }
          )
        },
          React.createElement(Icon, { name: item.icon, size: 18 }),
          React.createElement('span', null, item.label)
        );
      })
    ),

    /* Bottom: user / login */
    React.createElement('div', { style: bottomStyle },
      React.createElement('div', { className: 'gold-divider', style: { width: '32px', marginBottom: '4px' } }),
      user && isPro() && React.createElement('div', { title: 'Plan PRO activo',
        style: Object.assign({}, iconBtnBase, { background: 'rgba(201,169,110,0.15)', border: '1px solid rgba(201,169,110,0.3)' }) },
        React.createElement(Icon, { name: 'lightning', size: 15, className: 'text-gold' })
      ),
      user && !isPro() && React.createElement('button', { onClick: onShowUpgrade, title: 'Actualizar a PRO',
        style: Object.assign({}, iconBtnBase, { background: 'rgba(201,169,110,0.1)', border: '1px solid rgba(201,169,110,0.2)' }) },
        React.createElement(Icon, { name: 'lightning', size: 15, className: 'text-gold' })
      ),
      user ? React.createElement('button', { onClick: logout, title: 'Cerrar sesión',
        style: Object.assign({}, iconBtnBase, { color: 'rgba(250,247,244,0.3)' }) },
        React.createElement(Icon, { name: 'logout', size: 15 })
      ) : React.createElement('button', { onClick: onShowAuth, title: 'Iniciar sesión',
        className: 'gradient-accent',
        style: Object.assign({}, iconBtnBase, { color: 'white' }) },
        React.createElement(Icon, { name: 'user', size: 15 })
      )
    )
  );
}
function renderMessageContent(content) {
  if (!content) return null;
  var lines = content.split('\n');
  return lines.map(function(line, i) {
    var parts = line.split(/\*\*([^*]+)\*\*/);
    var rendered = parts.map(function(p, j) { return j % 2 === 1 ? React.createElement('strong', { key: j, className: 'font-semibold' }, p) : p; });
    return React.createElement('p', { key: i, className: i > 0 ? 'mt-1' : '' }, rendered);
  });
}
function ActionCard({ actionType, summary }) {
  if (!actionType || !summary) return null;
  var configs = {
    event_created:  { icon: '\u{1F4C5}', label: 'Evento creado',       color: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
    plan_created:   { icon: '\u{1F3CB}', label: 'Plan creado',          color: 'bg-blue-50 border-blue-200 text-blue-800' },
    plan_scheduled: { icon: '\u{1F4C6}', label: 'Sesiones programadas', color: 'bg-violet-50 border-violet-200 text-violet-800' },
    event_updated:  { icon: '\u270F',    label: 'Evento actualizado',   color: 'bg-amber-50 border-amber-200 text-amber-800' },
    event_deleted:  { icon: '\u{1F5D1}', label: 'Evento eliminado',     color: 'bg-red-50 border-red-200 text-red-700' },
    events_listed:  { icon: '\u{1F50D}', label: 'Tu agenda',            color: 'bg-panel border-border text-wine' },
  };
  var cfg = configs[actionType];
  if (!cfg) return null;
  var fields = Object.entries(summary).filter(function(e) { return e[1] != null && e[1] !== ''; });
  return React.createElement('div', { className: 'mt-2 p-3 rounded-xl border text-xs ' + cfg.color },
    React.createElement('div', { className: 'flex items-center gap-1.5 font-semibold mb-1.5' }, React.createElement('span', null, cfg.icon), cfg.label),
    fields.length > 0 && React.createElement('div', { className: 'space-y-0.5 opacity-75' },
      fields.slice(0, 4).map(function(e, i) { return React.createElement('div', { key: i }, String(e[0]).replace(/_/g, ' ') + ': ' + String(e[1])); })
    )
  );
}
function ChatPanel({ onShowUpgrade }) {
  const { user, isPro } = useAuth();
  const [messages, setMessages] = useState([{ role: 'assistant', content: 'Hola! Soy tu secretario IA. Puedo ayudarte a:\n\n- Crear y organizar eventos en tu agenda\n- Planificar entrenamientos o rutinas\n- Consultar y modificar lo que tienes\n\nCuenta qué necesitas hoy.', suggestions: ['¿Qué tengo esta semana?', 'Crear un evento', 'Hacer un plan de 4 semanas'] }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [msgCount, setMsgCount] = useState(0);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const chatRef = useRef(null);
  const inputRef = useRef(null);
  const { show, ToastEl } = useToast();
  const FREE_LIMIT = 20;
  const scrollToBottom = useCallback(function(force) {
    if (!chatRef.current) return;
    var el = chatRef.current;
    var atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (force || atBottom) el.scrollTop = el.scrollHeight;
  }, []);
  useEffect(function() { scrollToBottom(false); }, [messages, loading]);
  var handleScroll = function() {
    if (!chatRef.current) return;
    setShowScrollBtn(chatRef.current.scrollHeight - chatRef.current.scrollTop - chatRef.current.clientHeight > 150);
  };
  var handleInputChange = function(e) {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };
  var friendlyError = function(err) {
    if (!err) return 'Algo salió mal. Inténtalo de nuevo.';
    var msg = err.message || '';
    if (msg.includes('semanal') || msg.includes('limite')) return 'Has alcanzado el límite semanal. Actualiza a PRO para seguir.';
    if (msg.includes('autenticad') || err.status === 401) return 'Sesión expirada. Por favor, inicia sesión de nuevo.';
    if (err.status === 500) return 'Error interno. Inténtalo en unos instantes.';
    return msg || 'Algo salió mal. Inténtalo de nuevo.';
  };
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
    var lower = msgText.toLowerCase();
    if (pendingAction && /^(si|í|ok|vale|adelante|confirma|yes)$/i.test(lower.trim())) setPendingAction(null);
    if (pendingAction && /^(no|cancela|olvida|mejor no)$/i.test(lower.trim())) setPendingAction(null);
    try {
      var data = await api.post('/api/chat', { message: msgText });
      var newMsg = { role: 'assistant', content: data.response, intent: data.intent, action_type: data.action_type, summary: data.summary, suggestions: data.suggestions || [], requires_more_info: data.requires_more_info, missing_fields: data.missing_fields };
      if (data.requires_more_info && data.missing_fields && data.missing_fields.length > 0) setPendingAction({ intent: data.intent, question: data.response });
      else if (data.action_type && data.action_type !== 'error') setPendingAction(null);
      if (data.plan && data.plan.used >= FREE_LIMIT && !isPro()) { setTimeout(function() { onShowUpgrade && onShowUpgrade(); }, 1200); }
      setMessages(function(prev) { return prev.concat([newMsg]); });
    } catch(err) {
      setMessages(function(prev) { return prev.concat([{ role: 'assistant', content: friendlyError(err), error: true, suggestions: [] }]); });
      if (err.data && err.data.limit) setMsgCount(err.data.used || FREE_LIMIT);
      if (err.status === 403 && !isPro()) setTimeout(function() { onShowUpgrade && onShowUpgrade(); }, 1000);
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.focus();
    }
  };
  var handleKey = function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } };
  var intentBadge = function(intent) {
    var map = {
      crear_evento: { label: 'Evento',   color: 'bg-wine/10 text-wine border border-wine/20' },
      crear_plan:   { label: 'Plan',     color: 'bg-blue-50 text-blue-700 border border-blue-200' },
      consultar:    { label: 'Consulta', color: 'bg-amber-50 text-amber-700 border border-amber-200' },
      modificar:    { label: 'Editar',   color: 'bg-violet-50 text-violet-700 border border-violet-200' },
      eliminar:     { label: 'Eliminar', color: 'bg-red-50 text-red-600 border border-red-200' }
    };
    return map[intent] || null;
  };
  var remaining = FREE_LIMIT - msgCount;
  var isLimited = !isPro() && msgCount >= FREE_LIMIT;
  var charCount = input.length;
  var MAX_CHARS = 2000;
  var usagePct = isPro() ? 100 : Math.min((msgCount / FREE_LIMIT) * 100, 100);
  if (!user) return React.createElement('div', { className: 'flex-1 flex flex-col items-center justify-center bg-cream-dark p-8 space-y-5' },
    React.createElement('div', { className: 'w-20 h-20 rounded-3xl gradient-accent flex items-center justify-center shadow-premium-lg' }, React.createElement(LogoIcon, { size: 42, className: 'text-white' })),
    React.createElement('div', { className: 'text-center' },
      React.createElement('h2', { className: 'text-xl font-bold text-wine tracking-tight' }, 'Chat con tu IA'),
      React.createElement('p', { className: 'text-wine-light text-sm mt-1 font-light max-w-xs' }, 'Inicia sesión para hablar con tu asistente personal')
    )
  );
  return React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', background: '#FAF7F4', overflow: 'hidden', height: '100%' } },
    React.createElement('div', { className: 'px-6 py-4 border-b border-border/60 flex items-center justify-between bg-cream', style: { boxShadow: '0 1px 8px rgba(61,12,12,0.06)' } },
      React.createElement('div', { className: 'flex items-center gap-3' },
        React.createElement('div', { className: 'w-9 h-9 rounded-xl gradient-accent flex items-center justify-center shadow-premium' }, React.createElement(LogoIcon, { size: 20, className: 'text-white' })),
        React.createElement('div', null,
          React.createElement('h2', { className: 'font-semibold text-wine text-sm tracking-tight' }, 'Secretario IA'),
          React.createElement('div', { className: 'flex items-center gap-1.5' },
            React.createElement('div', { className: 'w-1.5 h-1.5 rounded-full bg-gold pulse-online' }),
            React.createElement('span', { className: 'text-[11px] text-wine-light/60 font-light' }, 'En línea')
          )
        )
      ),
      isPro() ? React.createElement('div', { className: 'flex items-center gap-1.5 bg-wine px-3 py-1.5 rounded-xl shadow-premium' },
        React.createElement(Icon, { name: 'lightning', size: 11, className: 'text-gold' }),
        React.createElement('span', { className: 'text-[11px] font-bold pro-badge' }, 'PRO')
      ) : React.createElement('div', { className: 'flex flex-col items-end gap-1' },
        React.createElement('div', { className: 'text-xs text-wine-light bg-panel px-3 py-1.5 rounded-xl border border-border' },
          React.createElement('span', { className: 'font-bold text-wine' }, msgCount), '/' + FREE_LIMIT + ' esta semana'
        ),
        React.createElement('div', { className: 'w-24 h-1 bg-border rounded-full overflow-hidden' },
          React.createElement('div', { className: 'h-1 rounded-full transition-all ' + (usagePct >= 90 ? 'bg-red-400' : usagePct >= 60 ? 'bg-gold' : 'bg-accent'), style: { width: usagePct + '%' } })
        )
      )
    ),
    React.createElement('div', { className: 'flex-1 overflow-hidden relative' },
      React.createElement('div', { ref: chatRef, onScroll: handleScroll, className: 'h-full overflow-auto px-6 py-5 space-y-4 chat-scroll' },
        messages.map(function(msg, i) {
          var badge = msg.intent ? intentBadge(msg.intent) : null;
          return React.createElement('div', { key: i, className: 'flex ' + (msg.role === 'user' ? 'justify-end' : 'justify-start') + ' fade-in' },
            React.createElement('div', { className: 'max-w-[80%]' },
              msg.role !== 'user' && badge && React.createElement('div', { className: 'flex items-center gap-1.5 mb-1.5 px-1' },
                React.createElement('span', { className: 'text-[10px] px-2 py-0.5 rounded-full font-semibold ' + badge.color }, badge.label)
              ),
              React.createElement('div', {
                className: (msg.role === 'user'
                  ? 'gradient-wine text-cream rounded-2xl rounded-br-sm shadow-premium'
                  : msg.error
                    ? 'bg-red-50 border border-red-200 text-red-700 rounded-2xl rounded-bl-sm'
                    : 'bg-white text-wine rounded-2xl rounded-bl-sm shadow-premium border border-border/40') + ' px-4 py-3 text-sm leading-relaxed'
              },
                msg.role === 'user' ? React.createElement('p', { className: 'whitespace-pre-line' }, msg.content) : renderMessageContent(msg.content)
              ),
              msg.action_type && msg.action_type !== 'error' && React.createElement(ActionCard, { actionType: msg.action_type, summary: msg.summary }),
              msg.role === 'assistant' && msg.requires_more_info && i === messages.length - 1 && React.createElement('div', { className: 'flex gap-2 mt-2' },
                React.createElement('button', { onClick: function() { sendMessage('si'); }, className: 'text-xs gradient-accent text-white px-3 py-1.5 rounded-xl hover:opacity-90 transition-all font-medium shadow-premium' }, 'Sí, continuar'),
                React.createElement('button', { onClick: function() { sendMessage('no cancela'); }, className: 'text-xs bg-panel text-wine px-3 py-1.5 rounded-xl hover:bg-border transition-all font-medium border border-border' }, 'Cancelar')
              ),
              msg.role === 'assistant' && msg.suggestions && msg.suggestions.length > 0 && i === messages.length - 1 && React.createElement('div', { className: 'flex flex-wrap gap-1.5 mt-2' },
                msg.suggestions.map(function(s, si) {
                  return React.createElement('button', { key: si, onClick: function() { sendMessage(s); },
                    className: 'text-[11px] bg-white border border-border text-wine px-2.5 py-1.5 rounded-lg hover:border-accent/50 hover:bg-cream-dark transition-all shadow-sm font-medium'
                  }, s);
                })
              )
            )
          );
        }),
        loading && React.createElement('div', { className: 'flex justify-start fade-in' },
          React.createElement('div', { className: 'bg-white rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2 shadow-premium border border-border/40' },
            React.createElement('div', { className: 'flex gap-1 items-center h-5' }, [1,2,3].map(function(n) { return React.createElement('div', { key: n, className: 'w-1.5 h-1.5 bg-wine/30 rounded-full typing-dot' }); })),
            React.createElement('span', { className: 'text-xs text-wine/30 ml-1 font-light' }, 'Pensando...')
          )
        )
      ),
      showScrollBtn && React.createElement('button', { onClick: function() { scrollToBottom(true); }, className: 'absolute bottom-4 right-4 w-9 h-9 gradient-accent text-white rounded-full shadow-premium-lg flex items-center justify-center hover:opacity-90 transition-all fade-in z-10' }, React.createElement(Icon, { name: 'chevronDown', size: 16 }))
    ),
    !isPro() && msgCount >= FREE_LIMIT - 3 && React.createElement('div', { className: 'mx-6 mb-2 p-3 bg-wine/5 border border-wine/15 rounded-2xl flex items-center justify-between' },
      React.createElement('p', { className: 'text-xs text-wine/60' }, msgCount >= FREE_LIMIT ? 'Límite semanal alcanzado' : ('Quedan ' + remaining + ' mensajes')),
      React.createElement('button', { onClick: onShowUpgrade, className: 'text-xs gradient-accent text-white px-3 py-1.5 rounded-xl font-semibold shadow-premium hover:opacity-90' }, 'Ir a PRO')
    ),
    React.createElement('div', { className: 'px-5 pb-5 pt-2' },
      React.createElement('div', { className: 'flex items-end gap-3 bg-white rounded-2xl border border-border p-3 shadow-premium focus-within:border-accent/50 focus-within:shadow-premium-lg transition-all' + (isLimited ? ' opacity-50' : '') },
        React.createElement('textarea', { ref: inputRef, value: input, onChange: handleInputChange, onKeyDown: handleKey,
          placeholder: isLimited ? 'Límite semanal alcanzado. Actualiza a PRO.' : 'Escribe algo… (Enter para enviar)',
          disabled: loading || isLimited, rows: 1, maxLength: MAX_CHARS,
          className: 'flex-1 bg-transparent text-wine placeholder-wine/30 text-sm resize-none focus:outline-none disabled:opacity-50 font-light',
          style: { maxHeight: '120px' }
        }),
        React.createElement('div', { className: 'flex flex-col items-end gap-2 flex-shrink-0' },
          charCount > 100 && React.createElement('span', { className: 'text-[10px] ' + (charCount > MAX_CHARS * 0.9 ? 'text-red-400' : 'text-wine/25') }, charCount + '/' + MAX_CHARS),
          React.createElement('button', { onClick: function() { sendMessage(); }, disabled: loading || !input.trim() || isLimited,
            className: 'w-9 h-9 rounded-xl gradient-accent flex items-center justify-center text-white hover:opacity-90 disabled:opacity-30 transition-all shadow-premium'
          }, React.createElement(Icon, { name: 'send', size: 15 }))
        )
      ),
      !isLimited && React.createElement('p', { className: 'text-[10px] text-wine/25 text-right mt-1.5 px-1 font-light' }, 'Enter para enviar · Shift+Enter nueva línea')
    ),
    ToastEl
  );
}
function CalendarView() {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newEvent, setNewEvent] = useState({ title: '', date: '', time: '', duration_minutes: 60, event_type: 'general' });
  const { show, ToastEl } = useToast();
  const today = new Date();
  const currentMonth = selectedDate.getMonth();
  const currentYear = selectedDate.getFullYear();
  useEffect(function() { if (user) fetchEvents(); }, [user, selectedDate]);
  const fetchEvents = async function() {
    setLoading(true);
    try {
      var firstDay = new Date(currentYear, currentMonth, 1).toISOString().split('T')[0];
      var lastDay = new Date(currentYear, currentMonth + 1, 0).toISOString().split('T')[0];
      var data = await api.get('/api/events?date_from=' + firstDay + '&date_to=' + lastDay);
      setEvents(data.events || []);
    } catch(e) { show(e.message, 'error'); } finally { setLoading(false); }
  };
  const createEvent = async function(e) {
    e.preventDefault();
    try { await api.post('/api/events', newEvent); show('Evento creado', 'success'); setShowForm(false); setNewEvent({ title: '', date: '', time: '', duration_minutes: 60, event_type: 'general' }); fetchEvents(); }
    catch(err) { show(err.message, 'error'); }
  };
  const deleteEvent = async function(id) {
    try { await api.del('/api/events/' + id); show('Evento eliminado', 'info'); fetchEvents(); }
    catch(err) { show(err.message, 'error'); }
  };
  const getDaysInMonth = function(y, m) { return new Date(y, m + 1, 0).getDate(); };
  const getFirstDayOfMonth = function(y, m) { return new Date(y, m, 1).getDay(); };
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = (getFirstDayOfMonth(currentYear, currentMonth) + 6) % 7;
  const totalCells = Math.ceil((daysInMonth + firstDay) / 7) * 7;
  const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const dayNames = ['Lu','Ma','Mi','Ju','Vi','Sa','Do'];
  const getEventsForDay = function(day) {
    var dateStr = currentYear + '-' + String(currentMonth + 1).padStart(2,'0') + '-' + String(day).padStart(2,'0');
    return events.filter(function(e) { return e.start_time && e.start_time.startsWith(dateStr); });
  };
  const etColors = { general: 'bg-wine/80', medico: 'bg-rose-500', trabajo: 'bg-blue-500', personal: 'bg-violet-500', deporte: 'bg-orange-500', reunion: 'bg-amber-500' };
  const selectedDayEvents = getEventsForDay(selectedDate.getDate());
  const prevMonth = function() { setSelectedDate(new Date(currentYear, currentMonth - 1, 1)); };
  const nextMonth = function() { setSelectedDate(new Date(currentYear, currentMonth + 1, 1)); };
  const inputClass = 'bg-cream-dark border border-border rounded-xl px-3 py-3 text-wine text-sm focus:border-accent transition-all';
  if (!user) return React.createElement('div', { className: 'flex-1 flex items-center justify-center bg-cream-dark' },
    React.createElement('div', { className: 'text-center space-y-4' },
      React.createElement('div', { className: 'w-16 h-16 rounded-2xl gradient-accent flex items-center justify-center mx-auto shadow-premium-lg' }, React.createElement(LogoIcon, { size: 34, className: 'text-white' })),
      React.createElement('h2', { className: 'text-xl font-bold text-wine tracking-tight' }, 'Tu Agenda Inteligente'),
      React.createElement('p', { className: 'text-wine-light text-sm font-light' }, 'Inicia sesión para ver tus eventos')
    ));
  return React.createElement('div', { style: { flex: 1, display: 'flex', overflow: 'hidden', background: '#F2EDE8' } },
    React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', padding: '20px', overflow: 'auto', minWidth: 0 } },
      React.createElement('div', { className: 'flex items-center justify-between mb-6' },
        React.createElement('div', { className: 'flex items-center gap-3' },
          React.createElement('button', { onClick: prevMonth, className: 'w-9 h-9 rounded-xl bg-cream hover:bg-panel border border-border flex items-center justify-center text-wine transition-all shadow-premium text-lg font-light' }, String.fromCharCode(8249)),
          React.createElement('h2', { className: 'text-xl font-bold text-wine tracking-tight' }, monthNames[currentMonth] + ' ' + currentYear),
          React.createElement('button', { onClick: nextMonth, className: 'w-9 h-9 rounded-xl bg-cream hover:bg-panel border border-border flex items-center justify-center text-wine transition-all shadow-premium text-lg font-light' }, String.fromCharCode(8250))
        ),
        React.createElement('div', { className: 'flex gap-2' },
          React.createElement('button', { onClick: function() { setSelectedDate(new Date()); }, className: 'px-4 py-2 text-sm bg-cream hover:bg-panel border border-border rounded-xl text-wine font-medium transition-all shadow-premium' }, 'Hoy'),
          React.createElement('button', { onClick: function() { setShowForm(true); }, className: 'flex items-center gap-2 px-4 py-2 text-sm gradient-accent text-white rounded-xl font-semibold hover:opacity-90 transition-all shadow-premium' }, React.createElement(Icon, { name: 'plus', size: 14 }), 'Nuevo evento')
        )
      ),
      React.createElement('div', { className: 'grid grid-cols-7 gap-1 mb-2' }, dayNames.map(function(d) {
        return React.createElement('div', { key: d, className: 'text-[11px] font-semibold text-wine/40 text-center py-1.5 uppercase tracking-widest' }, d);
      })),
      React.createElement('div', { className: 'grid grid-cols-7 gap-1 flex-1' },
        Array.from({ length: totalCells }, function(_, i) {
          var day = i - firstDay + 1;
          var isValid = day >= 1 && day <= daysInMonth;
          var isToday = isValid && day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();
          var isSelected = isValid && day === selectedDate.getDate() && currentMonth === selectedDate.getMonth() && currentYear === selectedDate.getFullYear();
          var dayEvents = isValid ? getEventsForDay(day) : [];
          return React.createElement('div', { key: i,
            onClick: function() { if (isValid) setSelectedDate(new Date(currentYear, currentMonth, day)); },
            className: 'min-h-[80px] p-2 rounded-xl border transition-all cursor-pointer ' + (!isValid ? 'opacity-0 pointer-events-none' : isSelected ? 'gradient-wine border-wine shadow-premium text-cream' : isToday ? 'bg-cream border-gold/50 shadow-premium' : 'bg-cream/60 border-transparent hover:border-border hover:bg-cream hover:shadow-premium')
          },
            isValid && React.createElement('div', null,
              isToday && !isSelected
                ? React.createElement('div', { className: 'w-6 h-6 rounded-full gradient-accent flex items-center justify-center mb-1' }, React.createElement('span', { className: 'text-xs font-bold text-white' }, day))
                : React.createElement('span', { className: 'text-sm font-semibold ' + (isSelected ? 'text-gold' : 'text-wine') }, day),
              React.createElement('div', { className: 'mt-1 space-y-0.5' },
                dayEvents.slice(0, 2).map(function(ev, idx) {
                  return React.createElement('div', { key: idx, className: 'text-[10px] px-1.5 py-0.5 rounded-md truncate font-medium ' + (isSelected ? 'bg-white/15 text-cream' : (etColors[ev.event_type] || 'bg-wine/70') + ' text-white') }, ev.title);
                }),
                dayEvents.length > 2 && React.createElement('div', { className: 'text-[10px] ' + (isSelected ? 'text-gold/70' : 'text-wine/40') }, '+' + (dayEvents.length - 2) + ' más')
              )
            )
          );
        })
      )
    ),
    React.createElement('div', { style: { width: '256px', minWidth: '256px', background: '#FAF7F4', borderLeft: '1px solid rgba(212,204,196,0.6)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '-4px 0 16px rgba(61,12,12,0.05)' } },
      React.createElement('div', { className: 'p-5 border-b border-border/60 bg-cream-dark' },
        React.createElement('h3', { className: 'font-bold text-wine tracking-tight' }, selectedDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })),
        React.createElement('p', { className: 'text-wine-light text-xs mt-0.5 font-light' }, selectedDayEvents.length === 0 ? 'Sin eventos' : selectedDayEvents.length + ' evento' + (selectedDayEvents.length > 1 ? 's' : ''))
      ),
      React.createElement('div', { className: 'flex-1 overflow-auto p-4 space-y-2 chat-scroll' },
        selectedDayEvents.length === 0
          ? React.createElement('div', { className: 'text-center py-10 text-wine/30' },
              React.createElement(Icon, { name: 'calendar', size: 28, className: 'mx-auto mb-2 opacity-20' }),
              React.createElement('p', { className: 'text-sm font-light' }, 'Día libre')
            )
          : selectedDayEvents.map(function(ev) {
              return React.createElement('div', { key: ev.id, className: 'event-card bg-cream-dark rounded-xl p-3.5 border border-border/60 group' },
                React.createElement('div', { className: 'flex items-start justify-between' },
                  React.createElement('div', { className: 'flex-1 min-w-0' },
                    React.createElement('div', { className: 'inline-block text-[10px] px-2 py-0.5 rounded-full font-semibold mb-1.5 ' + (etColors[ev.event_type] || 'bg-wine/70') + ' text-white uppercase tracking-wide' }, ev.event_type),
                    React.createElement('p', { className: 'text-sm font-semibold text-wine truncate' }, ev.title),
                    React.createElement('p', { className: 'text-xs text-wine/40 mt-0.5 flex items-center gap-1 font-light' },
                      React.createElement(Icon, { name: 'clock', size: 10 }),
                      new Date(ev.start_time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
                      ev.duration_minutes && (' · ' + ev.duration_minutes + ' min')
                    )
                  ),
                  React.createElement('button', { onClick: function() { deleteEvent(ev.id); }, className: 'opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-50 rounded-lg text-red-400 transition-all ml-2' },
                    React.createElement(Icon, { name: 'trash', size: 13 })
                  )
                )
              );
            })
      )
    ),
    showForm && React.createElement('div', { className: 'fixed inset-0 z-40 flex items-center justify-center modal-overlay bg-wine/20', onClick: function(e) { if (e.target === e.currentTarget) setShowForm(false); } },
      React.createElement('div', { className: 'bg-cream rounded-3xl p-7 w-full max-w-md shadow-premium-lg slide-up border border-border/60' },
        React.createElement('div', { className: 'flex items-center justify-between mb-6' },
          React.createElement('h3', { className: 'font-bold text-wine text-lg tracking-tight' }, 'Nuevo evento'),
          React.createElement('button', { onClick: function() { setShowForm(false); }, className: 'w-8 h-8 rounded-xl hover:bg-panel flex items-center justify-center text-wine/40 hover:text-wine transition-all' }, React.createElement(Icon, { name: 'x', size: 16 }))
        ),
        React.createElement('form', { onSubmit: createEvent, className: 'space-y-3' },
          React.createElement('input', { required: true, placeholder: 'Título del evento', value: newEvent.title, onChange: function(e) { setNewEvent(function(p) { return Object.assign({}, p, { title: e.target.value }); }); }, className: 'w-full ' + inputClass }),
          React.createElement('div', { className: 'grid grid-cols-2 gap-3' },
            React.createElement('input', { required: true, type: 'date', value: newEvent.date, onChange: function(e) { setNewEvent(function(p) { return Object.assign({}, p, { date: e.target.value }); }); }, className: inputClass }),
            React.createElement('input', { required: true, type: 'time', value: newEvent.time, onChange: function(e) { setNewEvent(function(p) { return Object.assign({}, p, { time: e.target.value }); }); }, className: inputClass })
          ),
          React.createElement('div', { className: 'grid grid-cols-2 gap-3' },
            React.createElement('input', { type: 'number', placeholder: 'Duración (min)', value: newEvent.duration_minutes, onChange: function(e) { setNewEvent(function(p) { return Object.assign({}, p, { duration_minutes: parseInt(e.target.value) }); }); }, className: inputClass }),
            React.createElement('select', { value: newEvent.event_type, onChange: function(e) { setNewEvent(function(p) { return Object.assign({}, p, { event_type: e.target.value }); }); }, className: inputClass },
              ['general','medico','trabajo','personal','deporte','reunion'].map(function(t) { return React.createElement('option', { key: t, value: t }, t.charAt(0).toUpperCase() + t.slice(1)); })
            )
          ),
          React.createElement('div', { className: 'flex gap-3 pt-2' },
            React.createElement('button', { type: 'button', onClick: function() { setShowForm(false); }, className: 'flex-1 py-3 rounded-xl border border-border text-wine font-medium hover:bg-panel transition-all text-sm' }, 'Cancelar'),
            React.createElement('button', { type: 'submit', className: 'flex-1 gradient-accent text-white py-3 rounded-xl font-semibold hover:opacity-90 transition-all shadow-premium text-sm' }, 'Crear evento')
          )
        )
      )
    ),
    ToastEl
  );
}
function PricingPage({ onShowAuth, onShowUpgrade }) {
  const { user, isPro, subscription, refreshSubscription } = useAuth();
  const [loadingPlan, setLoadingPlan] = useState('');
  const [portalLoading, setPortalLoading] = useState(false);
  const { show, ToastEl } = useToast();
  useEffect(function() { if (user) refreshSubscription(); }, [user]);
  const periodEnd = subscription && subscription.periodEnd ? new Date(subscription.periodEnd).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : null;
  const plans = [
    { id: 'free', name: 'Gratuito', price: '0', period: 'para siempre', description: 'Empieza a organizar tu agenda con IA', badge: null,
      features: [{ok:true,text:'20 mensajes de IA por semana'},{ok:true,text:'20 eventos en el calendario'},{ok:true,text:'Clasificación de intenciones'},{ok:true,text:'Creación básica de eventos'},{ok:false,text:'Planes de entrenamiento IA'},{ok:false,text:'Scheduler automático'},{ok:false,text:'Memoria personalizada'},{ok:false,text:'Emails de confirmación'}],
      cta: 'Empezar gratis', cardClass: 'border border-border', ctaClass: 'border border-border text-wine hover:bg-panel' },
    { id: 'pro', name: 'PRO', price: '9', period: '/mes', description: 'Para el máximo de productividad personal', badge: 'Más popular',
      features: [{ok:true,text:'IA ilimitada'},{ok:true,text:'Eventos ilimitados'},{ok:true,text:'Planes de entrenamiento con IA'},{ok:true,text:'Scheduler inteligente automático'},{ok:true,text:'Memoria personalizada a largo plazo'},{ok:true,text:'Emails de confirmación'},{ok:true,text:'Análisis de disponibilidad'},{ok:true,text:'Anti-solapamiento de eventos'}],
      cta: 'Suscribirse', cardClass: 'border-2 border-accent shadow-premium-lg', ctaClass: 'gradient-accent text-white hover:opacity-90 shadow-premium' },
    { id: 'premium', name: 'Premium', price: '19', period: '/mes', description: 'Para equipos y usuarios avanzados', badge: 'Próximamente',
      features: [{ok:true,text:'Todo lo del plan PRO'},{ok:true,text:'Múltiples calendarios'},{ok:true,text:'Integración Google Calendar'},{ok:true,text:'Recordatorios SMS/WhatsApp'},{ok:true,text:'Reportes semanales'},{ok:true,text:'Hasta 3 usuarios'}],
      cta: 'Lista de espera', cardClass: 'border border-border/60 opacity-75', ctaClass: 'border border-wine/20 text-wine hover:bg-wine/5' },
  ];
  const openPortal = async function() {
    setPortalLoading(true);
    try { const data = await api.get('/api/stripe/portal'); if (data.url) window.open(data.url, '_blank'); }
    catch(err) { show('Error al abrir el portal de facturación.', 'error'); }
    finally { setPortalLoading(false); }
  };
  const handleSubscribe = async function(planId) {
    if (planId === 'free') { if (!user) onShowAuth(); return; }
    if (planId === 'premium') { show('Anotado! Te avisamos cuando esté disponible', 'success'); return; }
    if (!user) { onShowAuth(); return; }
    if (isPro()) { show('Ya tienes el plan PRO activo', 'info'); return; }
    setLoadingPlan(planId);
    try { const data = await api.get('/api/stripe/checkout'); if (data.url) window.location.href = data.url; }
    catch(err) { show('Error al procesar el pago. Verifica que Stripe esté configurado.', 'error'); }
    finally { setLoadingPlan(''); }
  };
  return React.createElement('div', { className: 'flex-1 overflow-auto bg-cream-dark p-8 chat-scroll' },
    React.createElement('div', { className: 'text-center max-w-xl mx-auto mb-12' },
      React.createElement('h2', { className: 'text-4xl font-bold text-wine mb-3 tracking-tight' }, 'Elige tu plan'),
      React.createElement('p', { className: 'text-wine-light font-light' }, 'Sin compromisos • Cancela cuando quieras')
    ),
    isPro() && subscription && React.createElement('div', { className: 'max-w-md mx-auto mb-8 bg-wine rounded-2xl p-5 shadow-premium-lg' },
      React.createElement('div', { className: 'flex items-center justify-between mb-3' },
        React.createElement('div', { className: 'flex items-center gap-2' }, React.createElement(Icon, { name: 'lightning', size: 16, className: 'text-gold' }), React.createElement('span', { className: 'font-bold text-cream' }, 'Plan PRO activo')),
        React.createElement('span', { className: 'text-[11px] bg-gold text-wine px-2.5 py-1 rounded-full font-bold' }, subscription.status === 'trial' ? 'Trial' : 'Activo')
      ),
      periodEnd && React.createElement('p', { className: 'text-sm text-cream/60 mb-3 font-light' }, subscription.cancelAtPeriodEnd ? 'Se cancela el ' + periodEnd : 'Próxima renovación: ' + periodEnd),
      React.createElement('button', { onClick: openPortal, disabled: portalLoading, className: 'w-full py-2.5 rounded-xl border border-gold/30 text-gold text-sm font-semibold hover:bg-gold/10 transition-all disabled:opacity-50' }, portalLoading ? 'Cargando...' : 'Gestionar suscripción / Cancelar')
    ),
    React.createElement('div', { className: 'max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 mb-10' },
      plans.map(function(plan) {
        var isCurrentPlan = (plan.id === 'free' && !isPro()) || (plan.id === 'pro' && isPro());
        return React.createElement('div', { key: plan.id,
          className: 'relative bg-cream rounded-2xl p-6 flex flex-col transition-all ' + plan.cardClass + (plan.id === 'pro' ? ' shadow-premium-lg scale-105' : ' shadow-premium')
        },
          plan.badge && React.createElement('div', {
            className: 'absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-[11px] font-bold ' + (plan.badge === 'Más popular' ? 'gradient-accent text-white shadow-premium' : 'bg-panel text-wine border border-border')
          }, plan.badge),
          isCurrentPlan && React.createElement('div', { className: 'absolute -top-3 right-4 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-500 text-white shadow-sm' }, 'Tu plan'),
          React.createElement('div', { className: 'mb-5' },
            React.createElement('h3', { className: 'text-lg font-bold text-wine mb-2 tracking-tight' }, plan.name),
            React.createElement('div', { className: 'flex items-baseline gap-1 mb-2' },
              React.createElement('span', { className: 'text-4xl font-bold text-wine tracking-tight' }, plan.price + String.fromCharCode(8364)),
              React.createElement('span', { className: 'text-wine/40 text-sm font-light' }, plan.period)
            ),
            React.createElement('p', { className: 'text-wine/50 text-sm font-light' }, plan.description)
          ),
          React.createElement('ul', { className: 'flex-1 space-y-2.5 mb-6' },
            plan.features.map(function(f, i) {
              return React.createElement('li', { key: i, className: 'flex items-start gap-2.5' },
                React.createElement('div', { className: 'w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ' + (f.ok ? 'gradient-accent' : 'bg-wine/10') },
                  f.ok ? React.createElement(Icon, { name: 'check', size: 9, className: 'text-white' }) : React.createElement('span', { className: 'text-wine/30 text-[9px] font-bold' }, '×')
                ),
                React.createElement('span', { className: 'text-sm ' + (f.ok ? 'text-wine' : 'text-wine/30 line-through') }, f.text)
              );
            })
          ),
          React.createElement('button', { onClick: function() { handleSubscribe(plan.id); }, disabled: loadingPlan === plan.id || isCurrentPlan,
            className: 'w-full py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 ' + plan.ctaClass
          }, loadingPlan === plan.id ? 'Procesando...' : (isCurrentPlan ? 'Plan actual' : plan.cta))
        );
      })
    ),
    React.createElement('div', { className: 'text-center' },
      React.createElement('p', { className: 'text-wine/30 text-xs font-light' }, 'Pagos seguros con Stripe · Cancela en cualquier momento')
    ),
    ToastEl
  );
}
function PaymentSuccessBanner({ onClose }) {
  const { refreshSubscription } = useAuth();
  useEffect(function() { refreshSubscription(); }, []);
  useEffect(function() { const t = setTimeout(onClose, 7000); return function() { clearTimeout(t); }; }, []);
  return React.createElement('div', { className: 'fixed top-6 left-1/2 -translate-x-1/2 z-50 fade-in' },
    React.createElement('div', { className: 'bg-wine text-cream px-6 py-4 rounded-2xl shadow-premium-lg flex items-center gap-4 border border-gold/20' },
      React.createElement('div', { className: 'w-10 h-10 rounded-xl gradient-gold flex items-center justify-center flex-shrink-0' }, React.createElement(Icon, { name: 'lightning', size: 20, className: 'text-wine' })),
      React.createElement('div', null,
        React.createElement('p', { className: 'font-bold text-sm' }, 'Suscripción activada'),
        React.createElement('p', { className: 'text-cream/50 text-xs mt-0.5 font-light' }, 'Bienvenido a PRO. Ya tienes acceso ilimitado.')
      ),
      React.createElement('button', { onClick: onClose, className: 'ml-2 text-cream/30 hover:text-cream transition-all' }, React.createElement(Icon, { name: 'x', size: 16 }))
    )
  );
}
function App() {
  const { user, loading, refreshSubscription } = useAuth();
  const [view, setView] = useState('calendar');
  const [showAuth, setShowAuth] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showPaymentBanner, setShowPaymentBanner] = useState(false);
  useEffect(function() {
    var params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') { setShowPaymentBanner(true); window.history.replaceState({}, '', window.location.pathname); }
    if (params.get('payment') === 'cancel') { window.history.replaceState({}, '', window.location.pathname); }
  }, []);
  useEffect(function() { if (user) refreshSubscription(); }, [user]);
  if (loading) return React.createElement('div', { className: 'h-screen flex items-center justify-center bg-cream-dark' },
    React.createElement('div', { className: 'text-center space-y-4' },
      React.createElement('div', { className: 'w-14 h-14 rounded-2xl gradient-accent flex items-center justify-center mx-auto shadow-premium-lg' }, React.createElement(LogoIcon, { size: 30, className: 'text-white animate-pulse' })),
      React.createElement('p', { className: 'text-wine-light text-sm font-light' }, 'Cargando...')
    )
  );
  var renderView = function() {
    if (view === 'calendar') return React.createElement(CalendarView);
    if (view === 'chat') return React.createElement(ChatPanel, { onShowUpgrade: function() { setShowUpgrade(true); } });
    if (view === 'pricing') return React.createElement(PricingPage, { onShowAuth: function() { setShowAuth(true); }, onShowUpgrade: function() { setShowUpgrade(true); } });
    return React.createElement(CalendarView);
  };
  return React.createElement('div', { style: { height: '100vh', display: 'flex', overflow: 'hidden' } },
    React.createElement(Sidebar, { view, setView, onShowAuth: function() { setShowAuth(true); }, onShowUpgrade: function() { setShowUpgrade(true); } }),
    React.createElement('main', { style: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 } },
      React.createElement('div', { style: { flex: 1, display: 'flex', overflow: 'hidden' } }, renderView())
    ),
    showAuth && !user && React.createElement(AuthModal, { onClose: function() { setShowAuth(false); } }),
    showUpgrade && !user ? React.createElement(UpgradeModal, { onClose: function() { setShowUpgrade(false); }, onShowAuth: function() { setShowUpgrade(false); setShowAuth(true); } }) : null,
    showUpgrade && user ? React.createElement(UpgradeModal, { onClose: function() { setShowUpgrade(false); } }) : null,
    showPaymentBanner && React.createElement(PaymentSuccessBanner, { onClose: function() { setShowPaymentBanner(false); } })
  );
}
const root = ReactDOM.createRoot(document.getElementById('app'));
root.render(React.createElement(AuthProvider, null, React.createElement(App)));
