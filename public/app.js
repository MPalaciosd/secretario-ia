// SECRETARIO IA — React Frontend v3.2 (Stripe + Payments)
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
    if (token && saved) {
      try { setUser(JSON.parse(saved)); } catch(e) {}
    }
    setLoading(false);
  }, []);
  // Refresh subscription status from server
  const refreshSubscription = async function() {
    try {
      const data = await api.get('/api/subscription');
      if (data && data.subscription) {
        setSubscription(data.subscription);
        // Sync subscription_status into user object
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
    setUser(null);
    setSubscription(null);
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
    calendar: 'M8 2a1 1 0 0 0-2 0v1H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-1V2a1 1 0 0 0-2 0v1H8V2zM5 7h10v9H5V7z',
    chat: 'M2 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V5z',
    plus: 'M12 5v14M5 12h14',
    send: 'M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z',
    user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
    check: 'M20 6L9 17l-5-5',
    logout: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1',
    clock: 'M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zM12 6v6l4 2',
    trash: 'M3 6h18M8 6V4h8v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6',
    lightning: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
    alert: 'M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
    chevronDown: 'M6 9l6 6 6-6',
    x: 'M18 6L6 18M6 6l12 12',
    settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm6.93-3a7 7 0 0 0-.06-.9l1.96-1.53-1.87-3.24-2.3.93a7 7 0 0 0-1.56-.9L14.5 5h-4l-.6 2.36a7 7 0 0 0-1.56.9l-2.3-.93L4.17 10.6l1.96 1.53a7 7 0 0 0 0 1.8L4.17 15.4l1.87 3.24 2.3-.93a7 7 0 0 0 1.56.9L10.5 21h4l.6-2.36a7 7 0 0 0 1.56-.9l2.3.93 1.87-3.24-1.96-1.53a7 7 0 0 0 .06-.9z',
    creditCard: 'M1 4h22v16H1zM1 10h22'
  };
  return React.createElement('svg', { width: size, height: size, viewBox: '0 0 24 24', className, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
    React.createElement('path', { d: icons[name] || icons.star }));
};
function Toast({ message, type, onClose }) {
  useEffect(function() { const t = setTimeout(onClose, 4000); return function() { clearTimeout(t); }; }, []);
  const colors = { success: 'bg-wine text-cream', error: 'bg-red-700 text-white', info: 'bg-wine text-cream' };
  return React.createElement('div', { className: 'fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-xl text-sm font-medium fade-in ' + (colors[type] || colors.info) }, message);
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
      if (mode === 'login') await login(email);
      else await register(email, name);
      onClose();
    } catch(err) { setError(err.message); } finally { setLoading(false); }
  };
  return React.createElement('div', { className: 'fixed inset-0 z-50 flex items-center justify-center modal-overlay bg-black/30', onClick: function(e) { if (e.target === e.currentTarget) onClose(); } },
    React.createElement('div', { className: 'bg-cream rounded-2xl p-8 w-full max-w-md shadow-2xl fade-in border border-border' },
      React.createElement('div', { className: 'text-center mb-8' },
        React.createElement('div', { className: 'w-16 h-16 rounded-2xl gradient-accent flex items-center justify-center mx-auto mb-4' }, React.createElement(LogoIcon, { size: 38, className: 'text-white' })),
        React.createElement('h2', { className: 'text-2xl font-bold text-wine' }, 'Secretario IA'),
        React.createElement('p', { className: 'text-wine-light text-sm mt-1' }, 'Tu agenda inteligente')
      ),
      React.createElement('div', { className: 'flex bg-panel rounded-xl p-1 mb-6' },
        ['login','register'].map(function(m) {
          return React.createElement('button', { key: m, onClick: function() { setMode(m); setError(''); }, className: 'flex-1 py-2 rounded-lg text-sm font-medium transition-all ' + (mode === m ? 'bg-white text-wine shadow-sm' : 'text-wine-light hover:text-wine') },
            m === 'login' ? 'Iniciar sesion' : 'Registrarse');
        })
      ),
      React.createElement('form', { onSubmit: handleSubmit, className: 'space-y-4' },
        mode === 'register' && React.createElement('div', null, React.createElement('label', { className: 'block text-xs font-semibold text-wine-light mb-1.5 uppercase tracking-wide' }, 'Nombre'), React.createElement('input', { type: 'text', value: name, onChange: function(e) { setName(e.target.value); }, placeholder: 'Tu nombre', className: 'w-full bg-panel border border-border rounded-xl px-4 py-3 text-wine placeholder-wine/40 focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all' })),
        React.createElement('div', null, React.createElement('label', { className: 'block text-xs font-semibold text-wine-light mb-1.5 uppercase tracking-wide' }, 'Email'), React.createElement('input', { type: 'email', value: email, onChange: function(e) { setEmail(e.target.value); }, placeholder: 'tu@email.com', className: 'w-full bg-panel border border-border rounded-xl px-4 py-3 text-wine placeholder-wine/40 focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all' })),
        error && React.createElement('p', { className: 'text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg border border-red-200' }, error),
        React.createElement('button', { type: 'submit', disabled: loading, className: 'w-full gradient-accent text-white py-3 rounded-xl font-semibold hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 mt-2' }, loading ? 'Cargando...' : mode === 'login' ? 'Entrar' : 'Crear cuenta')
      ),
      React.createElement('p', { className: 'text-center text-xs text-wine/50 mt-6' }, 'Acceso seguro sin contrasena. Solo tu email.')
    )
  );
}
function UpgradeModal({ onClose, onShowAuth }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const handleUpgrade = async function() {
    if (!user) { onClose(); onShowAuth && onShowAuth(); return; }
    setLoading(true);
    try {
      const data = await api.get('/api/stripe/checkout');
      if (data.url) window.location.href = data.url;
    } catch(err) {
      alert('Error al procesar el pago. Intentalo de nuevo.');
    } finally { setLoading(false); }
  };
  return React.createElement('div', { className: 'fixed inset-0 z-50 flex items-center justify-center bg-black/40', onClick: function(e) { if (e.target === e.currentTarget) onClose(); } },
    React.createElement('div', { className: 'bg-cream rounded-2xl p-8 w-full max-w-sm shadow-2xl fade-in border border-border text-center' },
      React.createElement('div', { className: 'w-14 h-14 rounded-2xl gradient-accent flex items-center justify-center mx-auto mb-4' }, React.createElement(Icon, { name: 'lightning', size: 28, className: 'text-white' })),
      React.createElement('h3', { className: 'text-xl font-bold text-wine mb-2' }, 'Actualiza a PRO'),
      React.createElement('p', { className: 'text-wine/60 text-sm mb-6' }, 'IA ilimitada, planes de entrenamiento, memoria personalizada y mucho mas.'),
      React.createElement('div', { className: 'bg-panel rounded-xl p-4 mb-6 text-left space-y-2' },
        ['IA ilimitada sin restricciones semanales', 'Eventos ilimitados en tu agenda', 'Planes de entrenamiento con IA', 'Memoria personalizada a largo plazo', 'Emails de confirmacion automaticos'].map(function(f, i) {
          return React.createElement('div', { key: i, className: 'flex items-center gap-2' },
            React.createElement('div', { className: 'w-4 h-4 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0' }, React.createElement(Icon, { name: 'check', size: 10, className: 'text-accent' })),
            React.createElement('span', { className: 'text-sm text-wine' }, f));
        })
      ),
      React.createElement('button', { onClick: handleUpgrade, disabled: loading, className: 'w-full gradient-accent text-white py-3 rounded-xl font-bold text-sm hover:opacity-90 transition-all disabled:opacity-50 mb-3' }, loading ? 'Redirigiendo...' : 'Suscribirse por 9' + String.fromCharCode(8364) + '/mes'),
      React.createElement('button', { onClick: onClose, className: 'w-full text-wine/50 text-xs hover:text-wine transition-all' }, 'Ahora no')
    )
  );
}
function Sidebar({ view, setView, onShowAuth, onShowUpgrade }) {
  const { user, logout, isPro, subscription } = useAuth();
  const [portalLoading, setPortalLoading] = useState(false);
  const navItems = [{ id: 'calendar', label: 'Agenda', icon: 'calendar' }, { id: 'chat', label: 'Chat IA', icon: 'chat' }];
  const openPortal = async function() {
    setPortalLoading(true);
    try {
      const data = await api.get('/api/stripe/portal');
      if (data.url) window.open(data.url, '_blank');
    } catch(err) { alert('Error al abrir el portal de facturacion.'); }
    finally { setPortalLoading(false); }
  };
  const periodEnd = subscription && subscription.periodEnd ? new Date(subscription.periodEnd).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  return React.createElement('aside', { className: 'w-56 bg-sidebar h-full flex flex-col border-r border-border flex-shrink-0' },
    React.createElement('div', { className: 'p-5 border-b border-border' },
      React.createElement('div', { className: 'flex items-center gap-3' },
        React.createElement('div', { className: 'w-10 h-10 rounded-xl gradient-accent flex items-center justify-center' }, React.createElement(LogoIcon, { size: 26, className: 'text-white' })),
        React.createElement('div', null, React.createElement('h1', { className: 'font-bold text-wine text-sm leading-tight' }, 'Secretario IA'), React.createElement('p', { className: 'text-wine/50 text-xs' }, 'v3.2'))
      )
    ),
    React.createElement('nav', { className: 'flex-1 p-3 space-y-1' },
      navItems.map(function(item) {
        return React.createElement('button', { key: item.id, onClick: function() { setView(item.id); }, className: 'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ' + (view === item.id ? 'bg-wine text-cream shadow-sm' : 'text-wine hover:bg-wine/10') },
          React.createElement(Icon, { name: item.icon, size: 16 }), item.label);
      }),
      React.createElement('div', { className: 'my-3 border-t border-border' }),
      React.createElement('button', { onClick: function() { setView('pricing'); }, className: 'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ' + (view === 'pricing' ? 'bg-wine text-cream' : 'text-wine hover:bg-wine/10') },
        React.createElement(Icon, { name: 'star', size: 16 }), 'Planes')
    ),
    React.createElement('div', { className: 'p-3 border-t border-border space-y-2' },
      user && isPro() ? React.createElement('div', { className: 'space-y-1.5' },
        React.createElement('div', { className: 'flex items-center gap-2 px-3 py-2 bg-accent/10 rounded-xl' },
          React.createElement(Icon, { name: 'lightning', size: 14, className: 'text-accent' }),
          React.createElement('span', { className: 'text-xs font-semibold text-accent' }, 'Plan PRO activo')
        ),
        periodEnd && subscription && subscription.cancelAtPeriodEnd && React.createElement('p', { className: 'text-[10px] text-wine/50 px-3 text-center' }, 'Vence el ' + periodEnd),
        React.createElement('button', { onClick: openPortal, disabled: portalLoading, className: 'w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-wine/60 hover:bg-wine/10 hover:text-wine transition-all border border-border' },
          React.createElement(Icon, { name: 'creditCard', size: 12 }), portalLoading ? 'Cargando...' : 'Gestionar suscripcion')
      ) : user && React.createElement('button', { onClick: onShowUpgrade, className: 'w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold text-accent bg-accent/10 hover:bg-accent/20 transition-all' },
        React.createElement(Icon, { name: 'lightning', size: 12 }), 'Actualizar a PRO'),
      user ? React.createElement('div', { className: 'space-y-1' },
        React.createElement('div', { className: 'px-3 py-2 bg-panel rounded-xl' }, React.createElement('p', { className: 'text-xs font-semibold text-wine truncate' }, user.name), React.createElement('p', { className: 'text-xs text-wine/50 truncate' }, user.email)),
        React.createElement('button', { onClick: logout, className: 'w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-wine/60 hover:bg-wine/10 hover:text-wine transition-all' }, React.createElement(Icon, { name: 'logout', size: 14 }), 'Cerrar sesion')
      ) : React.createElement('button', { onClick: onShowAuth, className: 'w-full gradient-accent text-white py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-all' }, 'Iniciar sesion')
    )
  );
}
function renderMessageContent(content) {
  if (!content) return null;
  var lines = content.split('\n');
  return lines.map(function(line, i) {
    var parts = line.split(/\*\*([^*]+)\*\*/);
    var rendered = parts.map(function(p, j) { return j % 2 === 1 ? React.createElement('strong', { key: j }, p) : p; });
    return React.createElement('p', { key: i, className: i > 0 ? 'mt-1' : '' }, rendered);
  });
}
function ActionCard({ actionType, summary }) {
  if (!actionType || !summary) return null;
  var configs = {
    event_created:   { icon: '\u{1F4C5}', label: 'Evento creado',       color: 'bg-green-50 border-green-200 text-green-800' },
    plan_created:    { icon: '\u{1F3CB}', label: 'Plan creado',          color: 'bg-blue-50 border-blue-200 text-blue-800' },
    plan_scheduled:  { icon: '\u{1F4C6}', label: 'Sesiones programadas', color: 'bg-purple-50 border-purple-200 text-purple-800' },
    event_updated:   { icon: '\u270F',    label: 'Evento actualizado',   color: 'bg-amber-50 border-amber-200 text-amber-800' },
    event_deleted:   { icon: '\u{1F5D1}', label: 'Evento eliminado',     color: 'bg-red-50 border-red-200 text-red-700' },
    events_listed:   { icon: '\u{1F50D}', label: 'Tu agenda',            color: 'bg-wine/5 border-wine/20 text-wine' },
  };
  var cfg = configs[actionType];
  if (!cfg) return null;
  var fields = Object.entries(summary).filter(function(e) { return e[1] != null && e[1] !== ''; });
  return React.createElement('div', { className: 'mt-2 p-2.5 rounded-xl border text-xs ' + cfg.color },
    React.createElement('div', { className: 'flex items-center gap-1.5 font-semibold mb-1.5' }, React.createElement('span', null, cfg.icon), cfg.label),
    fields.length > 0 && React.createElement('div', { className: 'space-y-0.5 opacity-80' },
      fields.slice(0, 4).map(function(e, i) { return React.createElement('div', { key: i }, String(e[0]).replace(/_/g, ' ') + ': ' + String(e[1])); })
    )
  );
}
function ChatPanel({ onShowUpgrade }) {
  const { user, isPro } = useAuth();
  const [messages, setMessages] = useState([{ role: 'assistant', content: 'Hola! Soy tu secretario IA. Puedo ayudarte a:\n\n- Crear y organizar eventos en tu agenda\n- Planificar entrenamientos o rutinas\n- Consultar y modificar lo que tienes\n\nCuenta que necesitas hoy.', suggestions: ['Que tengo esta semana?', 'Crear un evento', 'Hacer un plan de 4 semanas'] }]);
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
    var el = chatRef.current;
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 150);
  };
  var handleInputChange = function(e) {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };
  var friendlyError = function(err) {
    if (!err) return 'Algo salio mal. Intentalo de nuevo.';
    var msg = err.message || '';
    if (msg.includes('semanal') || msg.includes('limite')) return 'Has alcanzado el limite semanal. Actualiza a PRO para seguir.';
    if (msg.includes('autenticad') || err.status === 401) return 'Sesion expirada. Por favor, inicia sesion de nuevo.';
    if (err.status === 500) return 'Error interno. Intentalo en unos instantes.';
    return msg || 'Algo salio mal. Intentalo de nuevo.';
  };
  var sendMessage = async function(text) {
    var msgText = (text || input).trim();
    if (!msgText || loading) return;
    if (!user) { show('Inicia sesion para usar el chat', 'info'); return; }
    if (!isPro() && msgCount >= FREE_LIMIT) {
      onShowUpgrade && onShowUpgrade(); return;
    }
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setMessages(function(prev) { return prev.concat([{ role: 'user', content: msgText }]); });
    setLoading(true);
    setMsgCount(function(c) { return c + 1; });
    var lower = msgText.toLowerCase();
    if (pendingAction && /^(si|si|ok|vale|adelante|confirma|yes)$/i.test(lower.trim())) setPendingAction(null);
    if (pendingAction && /^(no|cancela|olvida|mejor no)$/i.test(lower.trim())) setPendingAction(null);
    try {
      var data = await api.post('/api/chat', { message: msgText });
      var newMsg = { role: 'assistant', content: data.response, intent: data.intent, action_type: data.action_type, summary: data.summary, suggestions: data.suggestions || [], requires_more_info: data.requires_more_info, missing_fields: data.missing_fields };
      if (data.requires_more_info && data.missing_fields && data.missing_fields.length > 0) setPendingAction({ intent: data.intent, question: data.response });
      else if (data.action_type && data.action_type !== 'error') setPendingAction(null);
      // Check if limit reached
      if (data.plan && data.plan.used >= FREE_LIMIT && !isPro()) {
        setTimeout(function() { onShowUpgrade && onShowUpgrade(); }, 1200);
      }
      setMessages(function(prev) { return prev.concat([newMsg]); });
    } catch(err) {
      var errText = friendlyError(err);
      setMessages(function(prev) { return prev.concat([{ role: 'assistant', content: errText, error: true, suggestions: [] }]); });
      if (err.data && err.data.limit) setMsgCount(err.data.used || FREE_LIMIT);
      // If limit error, open upgrade modal
      if (err.status === 403 && !isPro()) setTimeout(function() { onShowUpgrade && onShowUpgrade(); }, 1000);
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.focus();
    }
  };
  var handleKey = function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } };
  var intentBadge = function(intent) {
    var map = { crear_evento: { label: 'Evento', color: 'bg-wine/15 text-wine' }, crear_plan: { label: 'Plan', color: 'bg-blue-100 text-blue-700' }, consultar: { label: 'Consulta', color: 'bg-amber-100 text-amber-700' }, modificar: { label: 'Modificar', color: 'bg-purple-100 text-purple-700' }, eliminar: { label: 'Eliminar', color: 'bg-red-100 text-red-600' } };
    return map[intent] || null;
  };
  var remaining = FREE_LIMIT - msgCount;
  var isLimited = !isPro() && msgCount >= FREE_LIMIT;
  var charCount = input.length;
  var MAX_CHARS = 2000;
  var usagePct = isPro() ? 100 : Math.min((msgCount / FREE_LIMIT) * 100, 100);
  if (!user) return React.createElement('div', { className: 'flex-1 flex flex-col items-center justify-center bg-cream p-8 space-y-4' },
    React.createElement('div', { className: 'w-20 h-20 rounded-3xl gradient-accent flex items-center justify-center' }, React.createElement(LogoIcon, { size: 44, className: 'text-white' })),
    React.createElement('h2', { className: 'text-xl font-bold text-wine text-center' }, 'Chat con tu IA'),
    React.createElement('p', { className: 'text-wine/60 text-sm text-center max-w-xs' }, 'Inicia sesion para hablar con tu asistente personal inteligente')
  );
  return React.createElement('div', { className: 'flex-1 flex flex-col bg-cream overflow-hidden' },
    React.createElement('div', { className: 'px-6 py-4 border-b border-border flex items-center justify-between bg-cream' },
      React.createElement('div', { className: 'flex items-center gap-3' },
        React.createElement('div', { className: 'w-9 h-9 rounded-xl gradient-accent flex items-center justify-center' }, React.createElement(LogoIcon, { size: 22, className: 'text-white' })),
        React.createElement('div', null,
          React.createElement('h2', { className: 'font-bold text-wine text-sm' }, 'Secretario IA'),
          React.createElement('div', { className: 'flex items-center gap-1.5' },
            React.createElement('div', { className: 'w-2 h-2 rounded-full bg-accent animate-pulse' }),
            React.createElement('span', { className: 'text-xs text-wine/50' }, 'En linea')
          )
        )
      ),
      isPro() ? React.createElement('div', { className: 'flex items-center gap-1.5 bg-accent/10 px-3 py-1.5 rounded-xl' },
        React.createElement(Icon, { name: 'lightning', size: 12, className: 'text-accent' }),
        React.createElement('span', { className: 'text-xs font-semibold text-accent' }, 'PRO')
      ) : React.createElement('div', { className: 'flex flex-col items-end gap-1' },
        React.createElement('div', { className: 'text-xs text-wine/50 bg-panel px-3 py-1.5 rounded-xl' },
          React.createElement('span', { className: 'font-semibold text-wine' }, msgCount), '/' + FREE_LIMIT + ' esta semana'
        ),
        React.createElement('div', { className: 'w-24 h-1 bg-border rounded-full overflow-hidden' },
          React.createElement('div', { className: 'h-1 rounded-full transition-all ' + (usagePct >= 90 ? 'bg-red-400' : usagePct >= 60 ? 'bg-amber-400' : 'bg-accent'), style: { width: usagePct + '%' } })
        )
      )
    ),
    React.createElement('div', { className: 'flex-1 overflow-hidden relative' },
      React.createElement('div', { ref: chatRef, onScroll: handleScroll, className: 'h-full overflow-auto px-6 py-4 space-y-4 chat-scroll' },
        messages.map(function(msg, i) {
          var badge = msg.intent ? intentBadge(msg.intent) : null;
          return React.createElement('div', { key: i, className: 'flex ' + (msg.role === 'user' ? 'justify-end' : 'justify-start') + ' fade-in' },
            React.createElement('div', { className: 'max-w-[82%]' },
              msg.role !== 'user' && badge && React.createElement('div', { className: 'flex items-center gap-1.5 mb-1.5 px-1' }, React.createElement('span', { className: 'text-[10px] px-2 py-0.5 rounded-full font-semibold ' + badge.color }, badge.label)),
              React.createElement('div', { className: (msg.role === 'user' ? 'bg-wine text-cream rounded-2xl rounded-br-md' : msg.error ? 'bg-red-50 border border-red-200 text-red-700 rounded-2xl rounded-bl-md' : 'bg-panel text-wine rounded-2xl rounded-bl-md') + ' px-4 py-3 text-sm leading-relaxed' },
                msg.role === 'user' ? React.createElement('p', { className: 'whitespace-pre-line' }, msg.content) : renderMessageContent(msg.content)
              ),
              msg.action_type && msg.action_type !== 'error' && React.createElement(ActionCard, { actionType: msg.action_type, summary: msg.summary }),
              msg.role === 'assistant' && msg.requires_more_info && i === messages.length - 1 && React.createElement('div', { className: 'flex gap-2 mt-2' },
                React.createElement('button', { onClick: function() { sendMessage('si'); }, className: 'text-xs bg-wine text-cream px-3 py-1.5 rounded-xl hover:bg-wine/80 transition-all font-medium' }, 'Si, continuar'),
                React.createElement('button', { onClick: function() { sendMessage('no cancela'); }, className: 'text-xs bg-panel text-wine px-3 py-1.5 rounded-xl hover:bg-border transition-all font-medium border border-border' }, 'Cancelar')
              ),
              msg.role === 'assistant' && msg.suggestions && msg.suggestions.length > 0 && i === messages.length - 1 && React.createElement('div', { className: 'flex flex-wrap gap-1.5 mt-2' },
                msg.suggestions.map(function(s, si) { return React.createElement('button', { key: si, onClick: function() { sendMessage(s); }, className: 'text-[11px] bg-cream border border-border text-wine px-2.5 py-1 rounded-lg hover:border-accent/60 hover:bg-panel transition-all' }, s); })
              )
            )
          );
        }),
        loading && React.createElement('div', { className: 'flex justify-start fade-in' },
          React.createElement('div', { className: 'bg-panel rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2' },
            React.createElement('div', { className: 'flex gap-1 items-center h-5' }, [1,2,3].map(function(n) { return React.createElement('div', { key: n, className: 'w-2 h-2 bg-wine/40 rounded-full typing-dot' }); })),
            React.createElement('span', { className: 'text-xs text-wine/40 ml-1' }, 'Pensando...')
          )
        )
      ),
      showScrollBtn && React.createElement('button', { onClick: function() { scrollToBottom(true); }, className: 'absolute bottom-4 right-4 w-9 h-9 bg-wine text-cream rounded-full shadow-lg flex items-center justify-center hover:bg-wine/80 transition-all fade-in z-10' }, React.createElement(Icon, { name: 'chevronDown', size: 16 }))
    ),
    !isPro() && msgCount >= FREE_LIMIT - 3 && React.createElement('div', { className: 'mx-6 mb-2 p-3 bg-wine/5 border border-wine/20 rounded-xl' },
      React.createElement('p', { className: 'text-xs text-wine/70 text-center' },
        msgCount >= FREE_LIMIT ? 'Limite semanal alcanzado. ' : ('Te quedan ' + remaining + ' mensajes esta semana. '),
        React.createElement('button', { onClick: onShowUpgrade, className: 'font-semibold text-accent underline' }, 'Actualiza a PRO')
      )
    ),
    React.createElement('div', { className: 'px-6 pb-6 pt-2' },
      React.createElement('div', { className: 'flex items-end gap-3 bg-panel rounded-2xl border border-border p-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 transition-all' + (isLimited ? ' opacity-50' : '') },
        React.createElement('textarea', { ref: inputRef, value: input, onChange: handleInputChange, onKeyDown: handleKey, placeholder: isLimited ? 'Limite semanal alcanzado. Actualiza a PRO.' : 'Escribe algo... (Enter para enviar, Shift+Enter para nueva linea)', disabled: loading || isLimited, rows: 1, maxLength: MAX_CHARS, className: 'flex-1 bg-transparent text-wine placeholder-wine/40 text-sm resize-none focus:outline-none disabled:opacity-50', style: { maxHeight: '120px' } }),
        React.createElement('div', { className: 'flex flex-col items-end gap-2 flex-shrink-0' },
          charCount > 100 && React.createElement('span', { className: 'text-[10px] ' + (charCount > MAX_CHARS * 0.9 ? 'text-red-400' : 'text-wine/30') }, charCount + '/' + MAX_CHARS),
          React.createElement('button', { onClick: function() { sendMessage(); }, disabled: loading || !input.trim() || isLimited, className: 'w-9 h-9 rounded-xl gradient-accent flex items-center justify-center text-white hover:opacity-90 disabled:opacity-40 transition-all' }, React.createElement(Icon, { name: 'send', size: 16 }))
        )
      ),
      !isLimited && React.createElement('p', { className: 'text-[10px] text-wine/30 text-right mt-1 px-1' }, 'Enter para enviar Shift+Enter para nueva linea')
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
  const eventTypeColors = { general: 'bg-wine/70', medico: 'bg-red-500', trabajo: 'bg-blue-400', personal: 'bg-purple-400', deporte: 'bg-orange-400', reunion: 'bg-amber-500' };
  const selectedDayEvents = getEventsForDay(selectedDate.getDate());
  const prevMonth = function() { setSelectedDate(new Date(currentYear, currentMonth - 1, 1)); };
  const nextMonth = function() { setSelectedDate(new Date(currentYear, currentMonth + 1, 1)); };
  if (!user) return React.createElement('div', { className: 'flex-1 flex items-center justify-center bg-cream' }, React.createElement('div', { className: 'text-center space-y-3' }, React.createElement('div', { className: 'w-16 h-16 rounded-2xl gradient-accent flex items-center justify-center mx-auto' }, React.createElement(LogoIcon, { size: 36, className: 'text-white' })), React.createElement('h2', { className: 'text-xl font-bold text-wine' }, 'Tu Agenda Inteligente'), React.createElement('p', { className: 'text-wine/60 text-sm' }, 'Inicia sesion para ver tus eventos')));
  return React.createElement('div', { className: 'flex-1 flex overflow-hidden bg-cream' },
    React.createElement('div', { className: 'flex-1 flex flex-col p-6 overflow-auto' },
      React.createElement('div', { className: 'flex items-center justify-between mb-6' },
        React.createElement('div', { className: 'flex items-center gap-4' },
          React.createElement('button', { onClick: prevMonth, className: 'w-8 h-8 rounded-lg hover:bg-panel flex items-center justify-center text-wine transition-all' }, String.fromCharCode(8249)),
          React.createElement('h2', { className: 'text-xl font-bold text-wine' }, monthNames[currentMonth] + ' ' + currentYear),
          React.createElement('button', { onClick: nextMonth, className: 'w-8 h-8 rounded-lg hover:bg-panel flex items-center justify-center text-wine transition-all' }, String.fromCharCode(8250))
        ),
        React.createElement('div', { className: 'flex gap-2' },
          React.createElement('button', { onClick: function() { setSelectedDate(new Date()); }, className: 'px-4 py-2 text-sm bg-panel hover:bg-border rounded-xl text-wine font-medium transition-all' }, 'Hoy'),
          React.createElement('button', { onClick: function() { setShowForm(true); }, className: 'flex items-center gap-2 px-4 py-2 text-sm gradient-accent text-white rounded-xl font-medium hover:opacity-90 transition-all' }, React.createElement(Icon, { name: 'plus', size: 14 }), 'Nuevo evento')
        )
      ),
      React.createElement('div', { className: 'grid grid-cols-7 gap-1 mb-1' }, dayNames.map(function(d) { return React.createElement('div', { key: d, className: 'text-xs font-semibold text-wine/50 text-center py-2 uppercase tracking-wide' }, d); })),
      React.createElement('div', { className: 'grid grid-cols-7 gap-1 flex-1' },
        Array.from({ length: totalCells }, function(_, i) {
          var day = i - firstDay + 1;
          var isValid = day >= 1 && day <= daysInMonth;
          var isToday = isValid && day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();
          var isSelected = isValid && day === selectedDate.getDate() && currentMonth === selectedDate.getMonth() && currentYear === selectedDate.getFullYear();
          var dayEvents = isValid ? getEventsForDay(day) : [];
          return React.createElement('div', { key: i, onClick: function() { if (isValid) setSelectedDate(new Date(currentYear, currentMonth, day)); }, className: 'min-h-[80px] p-2 rounded-xl border transition-all cursor-pointer ' + (!isValid ? 'opacity-0 pointer-events-none' : isSelected ? 'bg-wine border-wine text-cream' : isToday ? 'bg-accent/10 border-accent/40' : 'bg-panel/60 border-transparent hover:border-border hover:bg-panel') },
            isValid && React.createElement('div', null,
              React.createElement('span', { className: 'text-sm font-semibold ' + (isSelected ? 'text-cream' : isToday ? 'text-accent' : 'text-wine') }, day),
              React.createElement('div', { className: 'mt-1 space-y-0.5' },
                dayEvents.slice(0, 2).map(function(ev, idx) { return React.createElement('div', { key: idx, className: 'text-[10px] px-1.5 py-0.5 rounded-md truncate font-medium ' + (isSelected ? 'bg-white/20 text-cream' : (eventTypeColors[ev.event_type] || 'bg-wine/60') + ' text-white') }, ev.title); }),
                dayEvents.length > 2 && React.createElement('div', { className: 'text-[10px] ' + (isSelected ? 'text-cream/70' : 'text-wine/50') }, '+' + (dayEvents.length - 2) + ' mas')
              )
            )
          );
        })
      )
    ),
    React.createElement('div', { className: 'w-72 bg-panel border-l border-border flex flex-col overflow-hidden' },
      React.createElement('div', { className: 'p-4 border-b border-border' }, React.createElement('h3', { className: 'font-bold text-wine' }, selectedDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })), React.createElement('p', { className: 'text-wine/50 text-xs mt-0.5' }, selectedDayEvents.length === 0 ? 'Sin eventos' : selectedDayEvents.length + ' evento' + (selectedDayEvents.length > 1 ? 's' : ''))),
      React.createElement('div', { className: 'flex-1 overflow-auto p-4 space-y-2 chat-scroll' },
        selectedDayEvents.length === 0 ? React.createElement('div', { className: 'text-center py-8 text-wine/40' }, React.createElement(Icon, { name: 'calendar', size: 32, className: 'mx-auto mb-2 opacity-30' }), React.createElement('p', { className: 'text-sm' }, 'Dia libre')) :
        selectedDayEvents.map(function(ev) {
          return React.createElement('div', { key: ev.id, className: 'event-card bg-cream rounded-xl p-3 border border-border group' },
            React.createElement('div', { className: 'flex items-start justify-between' },
              React.createElement('div', { className: 'flex-1 min-w-0' },
                React.createElement('div', { className: 'inline-block text-[10px] px-2 py-0.5 rounded-full font-semibold mb-1 ' + (eventTypeColors[ev.event_type] || 'bg-wine/70') + ' text-white' }, ev.event_type),
                React.createElement('p', { className: 'text-sm font-semibold text-wine truncate' }, ev.title),
                React.createElement('p', { className: 'text-xs text-wine/50 mt-0.5 flex items-center gap-1' }, React.createElement(Icon, { name: 'clock', size: 11 }), new Date(ev.start_time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }), ev.duration_minutes && (' · ' + ev.duration_minutes + ' min'))
              ),
              React.createElement('button', { onClick: function() { deleteEvent(ev.id); }, className: 'opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 rounded-lg text-red-400 transition-all' }, React.createElement(Icon, { name: 'trash', size: 14 }))
            )
          );
        })
      )
    ),
    showForm && React.createElement('div', { className: 'fixed inset-0 z-40 flex items-center justify-center modal-overlay bg-black/30', onClick: function(e) { if (e.target === e.currentTarget) setShowForm(false); } },
      React.createElement('div', { className: 'bg-cream rounded-2xl p-6 w-full max-w-md shadow-2xl fade-in border border-border' },
        React.createElement('h3', { className: 'font-bold text-wine text-lg mb-5' }, 'Nuevo evento'),
        React.createElement('form', { onSubmit: createEvent, className: 'space-y-4' },
          React.createElement('input', { required: true, placeholder: 'Titulo del evento', value: newEvent.title, onChange: function(e) { setNewEvent(function(p) { return Object.assign({}, p, { title: e.target.value }); }); }, className: 'w-full bg-panel border border-border rounded-xl px-4 py-3 text-wine placeholder-wine/40 focus:border-accent transition-all' }),
          React.createElement('div', { className: 'grid grid-cols-2 gap-3' },
            React.createElement('input', { required: true, type: 'date', value: newEvent.date, onChange: function(e) { setNewEvent(function(p) { return Object.assign({}, p, { date: e.target.value }); }); }, className: 'bg-panel border border-border rounded-xl px-3 py-3 text-wine focus:border-accent transition-all' }),
            React.createElement('input', { required: true, type: 'time', value: newEvent.time, onChange: function(e) { setNewEvent(function(p) { return Object.assign({}, p, { time: e.target.value }); }); }, className: 'bg-panel border border-border rounded-xl px-3 py-3 text-wine focus:border-accent transition-all' })
          ),
          React.createElement('div', { className: 'grid grid-cols-2 gap-3' },
            React.createElement('input', { type: 'number', placeholder: 'Duracion (min)', value: newEvent.duration_minutes, onChange: function(e) { setNewEvent(function(p) { return Object.assign({}, p, { duration_minutes: parseInt(e.target.value) }); }); }, className: 'bg-panel border border-border rounded-xl px-3 py-3 text-wine focus:border-accent transition-all' }),
            React.createElement('select', { value: newEvent.event_type, onChange: function(e) { setNewEvent(function(p) { return Object.assign({}, p, { event_type: e.target.value }); }); }, className: 'bg-panel border border-border rounded-xl px-3 py-3 text-wine focus:border-accent transition-all' },
              ['general','medico','trabajo','personal','deporte','reunion'].map(function(t) { return React.createElement('option', { key: t, value: t }, t.charAt(0).toUpperCase() + t.slice(1)); })
            )
          ),
          React.createElement('div', { className: 'flex gap-3 pt-2' },
            React.createElement('button', { type: 'button', onClick: function() { setShowForm(false); }, className: 'flex-1 py-3 rounded-xl border border-border text-wine font-medium hover:bg-panel transition-all' }, 'Cancelar'),
            React.createElement('button', { type: 'submit', className: 'flex-1 gradient-accent text-white py-3 rounded-xl font-medium hover:opacity-90 transition-all' }, 'Crear evento')
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
    { id: 'free', name: 'Gratuito', price: '0', period: 'para siempre', description: 'Empieza a organizar tu agenda con IA', color: 'border-border', badge: null, features: [{ok:true,text:'20 mensajes de IA por semana'},{ok:true,text:'20 eventos en el calendario'},{ok:true,text:'Clasificacion de intenciones'},{ok:true,text:'Creacion basica de eventos'},{ok:false,text:'Planes de entrenamiento IA'},{ok:false,text:'Scheduler automatico'},{ok:false,text:'Memoria personalizada'},{ok:false,text:'Emails de confirmacion'}], cta: 'Empezar gratis', ctaStyle: 'border-2 border-border text-wine hover:bg-panel' },
    { id: 'pro', name: 'PRO', price: '9', period: '/ mes', description: 'Para personas que quieren el maximo de productividad', color: 'border-accent', badge: 'Mas popular', features: [{ok:true,text:'IA ilimitada'},{ok:true,text:'Eventos ilimitados'},{ok:true,text:'Planes de entrenamiento con IA'},{ok:true,text:'Scheduler inteligente automatico'},{ok:true,text:'Memoria personalizada a largo plazo'},{ok:true,text:'Emails de confirmacion'},{ok:true,text:'Analisis de disponibilidad'},{ok:true,text:'Anti-solapamiento de eventos'}], cta: 'Suscribirse', ctaStyle: 'gradient-accent text-white hover:opacity-90' },
    { id: 'premium', name: 'Premium', price: '19', period: '/ mes', description: 'Para equipos y usuarios avanzados', color: 'border-wine/40', badge: 'Proximamente', features: [{ok:true,text:'Todo lo del plan PRO'},{ok:true,text:'Multiples calendarios'},{ok:true,text:'Integracion Google Calendar'},{ok:true,text:'Recordatorios SMS/WhatsApp'},{ok:true,text:'Reportes semanales'},{ok:true,text:'Hasta 3 usuarios'}], cta: 'Lista de espera', ctaStyle: 'border-2 border-wine/30 text-wine hover:bg-wine/5' },
  ];
  const openPortal = async function() {
    setPortalLoading(true);
    try {
      const data = await api.get('/api/stripe/portal');
      if (data.url) window.open(data.url, '_blank');
    } catch(err) { show('Error al abrir el portal de facturacion.', 'error'); }
    finally { setPortalLoading(false); }
  };
  const handleSubscribe = async function(planId) {
    if (planId === 'free') { if (!user) onShowAuth(); return; }
    if (planId === 'premium') { show('Anotado! Te avisamos cuando este disponible', 'success'); return; }
    if (!user) { onShowAuth(); return; }
    if (isPro()) { show('Ya tienes el plan PRO activo', 'info'); return; }
    setLoadingPlan(planId);
    try {
      const data = await api.get('/api/stripe/checkout');
      if (data.url) window.location.href = data.url;
    } catch(err) { show('Error al procesar el pago. Verifica que Stripe este configurado.', 'error'); }
    finally { setLoadingPlan(''); }
  };
  return React.createElement('div', { className: 'flex-1 overflow-auto bg-cream p-8 chat-scroll' },
    React.createElement('div', { className: 'text-center max-w-2xl mx-auto mb-10' },
      React.createElement('h2', { className: 'text-4xl font-bold text-wine mb-3' }, 'Elige tu plan'),
      React.createElement('p', { className: 'text-wine/60' }, 'Sin compromisos. Cancela cuando quieras.')
    ),
    isPro() && subscription && React.createElement('div', { className: 'max-w-md mx-auto mb-8 bg-accent/10 border border-accent/30 rounded-2xl p-5' },
      React.createElement('div', { className: 'flex items-center justify-between mb-3' },
        React.createElement('div', { className: 'flex items-center gap-2' }, React.createElement(Icon, { name: 'lightning', size: 18, className: 'text-accent' }), React.createElement('span', { className: 'font-bold text-wine' }, 'Plan PRO activo')),
        React.createElement('span', { className: 'text-xs bg-accent text-white px-2.5 py-1 rounded-full font-semibold' }, subscription.status === 'trial' ? 'Trial' : 'Activo')
      ),
      periodEnd && React.createElement('p', { className: 'text-sm text-wine/70 mb-3' }, subscription.cancelAtPeriodEnd ? 'Tu suscripcion se cancela el ' + periodEnd : 'Proxima renovacion: ' + periodEnd),
      React.createElement('button', { onClick: openPortal, disabled: portalLoading, className: 'w-full py-2.5 rounded-xl border border-accent/40 text-accent text-sm font-semibold hover:bg-accent/10 transition-all disabled:opacity-50' }, portalLoading ? 'Cargando...' : 'Gestionar suscripcion / Cancelar')
    ),
    React.createElement('div', { className: 'max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 mb-10' },
      plans.map(function(plan) {
        var isCurrentPlan = (plan.id === 'free' && !isPro()) || (plan.id === 'pro' && isPro());
        return React.createElement('div', { key: plan.id, className: 'relative bg-panel rounded-2xl p-6 border-2 ' + plan.color + ' flex flex-col ' + (plan.id === 'pro' ? 'shadow-xl scale-105' : '') },
          plan.badge && React.createElement('div', { className: 'absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold ' + (plan.badge === 'Mas popular' ? 'bg-accent text-white' : 'bg-wine text-cream') }, plan.badge),
          isCurrentPlan && React.createElement('div', { className: 'absolute -top-3 right-4 px-3 py-1 rounded-full text-xs font-bold bg-green-500 text-white' }, 'Tu plan'),
          React.createElement('div', { className: 'mb-5' },
            React.createElement('h3', { className: 'text-lg font-bold text-wine mb-1' }, plan.name),
            React.createElement('div', { className: 'flex items-baseline gap-1 mb-2' }, React.createElement('span', { className: 'text-4xl font-bold text-wine' }, plan.price + String.fromCharCode(8364)), React.createElement('span', { className: 'text-wine/50 text-sm' }, plan.period)),
            React.createElement('p', { className: 'text-wine/60 text-sm' }, plan.description)
          ),
          React.createElement('ul', { className: 'flex-1 space-y-2 mb-5' },
            plan.features.map(function(f, i) {
              return React.createElement('li', { key: i, className: 'flex items-start gap-2' },
                React.createElement('div', { className: 'w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ' + (f.ok ? 'bg-accent/20 text-accent' : 'bg-wine/10 text-wine/30') }, f.ok ? React.createElement(Icon, { name: 'check', size: 10 }) : React.createElement('span', { style: { fontSize: '10px' } }, 'x')),
                React.createElement('span', { className: 'text-sm ' + (f.ok ? 'text-wine' : 'text-wine/40') }, f.text)
              );
            })
          ),
          React.createElement('button', { onClick: function() { handleSubscribe(plan.id); }, disabled: loadingPlan === plan.id || isCurrentPlan, className: 'w-full py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-60 ' + plan.ctaStyle },
            loadingPlan === plan.id ? 'Procesando...' : (isCurrentPlan ? 'Plan actual' : plan.cta)
          )
        );
      })
    ),
    React.createElement('div', { className: 'max-w-lg mx-auto text-center' },
      React.createElement('p', { className: 'text-wine/40 text-xs' }, 'Pagos seguros con Stripe. Cancela en cualquier momento desde el portal de facturacion.')
    ),
    ToastEl
  );
}
function PaymentSuccessBanner({ onClose }) {
  const { refreshSubscription } = useAuth();
  useEffect(function() { refreshSubscription(); }, []);
  useEffect(function() { const t = setTimeout(onClose, 7000); return function() { clearTimeout(t); }; }, []);
  return React.createElement('div', { className: 'fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-wine text-cream px-6 py-4 rounded-2xl shadow-2xl fade-in flex items-center gap-3 max-w-sm' },
    React.createElement(Icon, { name: 'lightning', size: 20, className: 'text-accent flex-shrink-0' }),
    React.createElement('div', null,
      React.createElement('p', { className: 'font-bold text-sm' }, 'Suscripcion activada'),
      React.createElement('p', { className: 'text-cream/70 text-xs mt-0.5' }, 'Bienvenido a PRO. Ya tienes acceso ilimitado.')
    ),
    React.createElement('button', { onClick: onClose, className: 'ml-2 text-cream/60 hover:text-cream' }, React.createElement(Icon, { name: 'x', size: 16 }))
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
    if (params.get('payment') === 'success') {
      setShowPaymentBanner(true);
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (params.get('payment') === 'cancel') {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);
  // Refresh subscription status when user is available
  useEffect(function() { if (user) refreshSubscription(); }, [user]);
  if (loading) return React.createElement('div', { className: 'h-screen flex items-center justify-center bg-cream' },
    React.createElement('div', { className: 'text-center space-y-3' },
      React.createElement('div', { className: 'w-14 h-14 rounded-2xl gradient-accent flex items-center justify-center mx-auto' }, React.createElement(LogoIcon, { size: 32, className: 'text-white animate-pulse' })),
      React.createElement('p', { className: 'text-wine/60 text-sm' }, 'Cargando...')
    )
  );
  var renderView = function() {
    if (view === 'calendar') return React.createElement(CalendarView);
    if (view === 'chat') return React.createElement(ChatPanel, { onShowUpgrade: function() { setShowUpgrade(true); } });
    if (view === 'pricing') return React.createElement(PricingPage, { onShowAuth: function() { setShowAuth(true); }, onShowUpgrade: function() { setShowUpgrade(true); } });
    return React.createElement(CalendarView);
  };
  return React.createElement('div', { className: 'h-screen flex overflow-hidden' },
    React.createElement(Sidebar, { view, setView, onShowAuth: function() { setShowAuth(true); }, onShowUpgrade: function() { setShowUpgrade(true); } }),
    React.createElement('main', { className: 'flex-1 flex flex-col overflow-hidden' },
      React.createElement('div', { className: 'flex-1 flex overflow-hidden' }, renderView())
    ),
    showAuth && !user && React.createElement(AuthModal, { onClose: function() { setShowAuth(false); } }),
    showUpgrade && !user ? React.createElement(UpgradeModal, { onClose: function() { setShowUpgrade(false); }, onShowAuth: function() { setShowUpgrade(false); setShowAuth(true); } }) : null,
    showUpgrade && user ? React.createElement(UpgradeModal, { onClose: function() { setShowUpgrade(false); } }) : null,
    showPaymentBanner && React.createElement(PaymentSuccessBanner, { onClose: function() { setShowPaymentBanner(false); } })
  );
}
const root = ReactDOM.createRoot(document.getElementById('app'));
root.render(React.createElement(AuthProvider, null, React.createElement(App)));
