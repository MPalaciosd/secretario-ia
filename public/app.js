// ═══════════════════════════════════════════════════════════════
// SECRETARIO IA — React Frontend (Single File SPA)
// Backend: https://secretario-ia-y80a.onrender.com
// ═══════════════════════════════════════════════════════════════
const { useState, useEffect, useRef, useCallback, createContext, useContext } = React;

// ── API Configuration ─────────────────────────────────────────
const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';

const api = {
  async request(path, options = {}) {
    const token = localStorage.getItem('sai_token');
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(API_BASE + path, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || 'Error del servidor'), { status: res.status, data });
    return data;
  },
  get:  (p)    => api.request(p),
  post: (p, b) => api.request(p, { method: 'POST',   body: JSON.stringify(b) }),
  put:  (p, b) => api.request(p, { method: 'PUT',    body: JSON.stringify(b) }),
  del:  (p)    => api.request(p, { method: 'DELETE' })
};

// ── Auth Context ──────────────────────────────────────────────
const AuthContext = createContext(null);
function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const token = localStorage.getItem('sai_token');
    const saved = localStorage.getItem('sai_user');
    if (token && saved) { try { setUser(JSON.parse(saved)); } catch(e) {} }
    setLoading(false);
  }, []);
  const login    = async (email) => {
    const data = await api.post('/api/auth/login',    { email });
    localStorage.setItem('sai_token', data.token);
    localStorage.setItem('sai_user',  JSON.stringify(data.user));
    setUser(data.user); return data.user;
  };
  const register = async (email, name) => {
    const data = await api.post('/api/auth/register', { email, name });
    localStorage.setItem('sai_token', data.token);
    localStorage.setItem('sai_user',  JSON.stringify(data.user));
    setUser(data.user); return data.user;
  };
  const logout = () => {
    localStorage.removeItem('sai_token');
    localStorage.removeItem('sai_user');
    setUser(null);
  };
  const isPro = () => user?.subscription_status === 'active' || user?.subscription_status === 'trial';
  return React.createElement(AuthContext.Provider,
    { value: { user, login, register, logout, loading, isPro } }, children);
}
const useAuth = () => useContext(AuthContext);

// ── Custom Logo SVG (user-provided design) ───────────────────
function LogoIcon({ size = 36, className = '' }) {
  const s = size;
  return React.createElement('svg', {
    width: s, height: s, viewBox: '0 0 200 200',
    className, xmlns: 'http://www.w3.org/2000/svg'
  },
    // Outer circle
    React.createElement('circle', { cx: 100, cy: 100, r: 95, fill: 'none', stroke: 'currentColor', strokeWidth: 10 }),
    // Inner square (rotated slightly like original)
    React.createElement('rect', { x: 38, y: 38, width: 124, height: 124, rx: 8, fill: 'none', stroke: 'currentColor', strokeWidth: 10 }),
    // Top-right quarter circle (arc inside)
    React.createElement('path', {
      d: 'M100 38 A62 62 0 0 1 162 100',
      fill: 'none', stroke: 'currentColor', strokeWidth: 10, strokeLinecap: 'round'
    }),
    // Bottom-left quarter circle
    React.createElement('path', {
      d: 'M38 100 A62 62 0 0 0 100 162',
      fill: 'none', stroke: 'currentColor', strokeWidth: 10, strokeLinecap: 'round'
    })
  );
}

// ── Icons (inline SVG) ────────────────────────────────────────
const Icon = ({ name, size = 18, className = '' }) => {
  const icons = {
    calendar: 'M8 2a1 1 0 0 0-2 0v1H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-1V2a1 1 0 0 0-2 0v1H8V2zM5 7h10v9H5V7z',
    chat:     'M2 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V5z',
    plus:     'M12 5v14M5 12h14',
    send:     'M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z',
    user:     'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    star:     'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
    check:    'M20 6L9 17l-5-5',
    logout:   'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1',
    settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m9 9l1.4 1.4M5.6 18.4l1.4-1.4m9-9l1.4-1.4',
    clock:    'M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zM12 6v6l4 2',
    trash:    'M3 6h18M8 6V4h8v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6',
    lightning:'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
    alert:    'M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z'
  };
  const d = icons[name] || icons.star;
  return React.createElement('svg', {
    width: size, height: size, viewBox: '0 0 24 24', className,
    fill: 'none', stroke: 'currentColor', strokeWidth: 2,
    strokeLinecap: 'round', strokeLinejoin: 'round'
  }, React.createElement('path', { d }));
};

// ── Toast Notification ────────────────────────────────────────
function Toast({ message, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, []);
  const colors = {
    success: 'bg-wine text-cream',
    error:   'bg-red-700 text-white',
    info:    'bg-wine text-cream'
  };
  return React.createElement('div', {
    className: `fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-xl text-sm font-medium fade-in ${colors[type] || colors.info}`
  }, message);
}
function useToast() {
  const [toast, setToast] = useState(null);
  const show = (message, type = 'info') => setToast({ message, type, id: Date.now() });
  const hide = () => setToast(null);
  const ToastEl = toast ? React.createElement(Toast, { ...toast, onClose: hide }) : null;
  return { show, ToastEl };
}

// ═══════════════════════════════════════════════════════════════
// AUTH MODAL
// ═══════════════════════════════════════════════════════════════
function AuthModal({ onClose }) {
  const { login, register } = useAuth();
  const [mode,    setMode]    = useState('login');
  const [email,   setEmail]   = useState('');
  const [name,    setName]    = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) return setError('Email requerido');
    if (mode === 'register' && !name) return setError('Nombre requerido');
    setLoading(true); setError('');
    try {
      if (mode === 'login') await login(email);
      else await register(email, name);
      onClose();
    } catch(err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return React.createElement('div', {
    className: 'fixed inset-0 z-50 flex items-center justify-center modal-overlay bg-black/30',
    onClick: e => e.target === e.currentTarget && onClose()
  },
    React.createElement('div', {
      className: 'bg-cream rounded-2xl p-8 w-full max-w-md shadow-2xl fade-in border border-border'
    },
      // Header with custom logo
      React.createElement('div', { className: 'text-center mb-8' },
        React.createElement('div', {
          className: 'w-16 h-16 rounded-2xl gradient-accent flex items-center justify-center mx-auto mb-4'
        },
          React.createElement(LogoIcon, { size: 38, className: 'text-white' })
        ),
        React.createElement('h2', { className: 'text-2xl font-bold text-wine' }, 'Secretario IA'),
        React.createElement('p',  { className: 'text-wine-light text-sm mt-1' }, 'Tu agenda inteligente')
      ),
      // Tab switcher
      React.createElement('div', { className: 'flex bg-panel rounded-xl p-1 mb-6' },
        ['login','register'].map(m =>
          React.createElement('button', {
            key: m, onClick: () => { setMode(m); setError(''); },
            className: `flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              mode === m ? 'bg-white text-wine shadow-sm' : 'text-wine-light hover:text-wine'}`
          }, m === 'login' ? 'Iniciar sesión' : 'Registrarse')
        )
      ),
      // Form
      React.createElement('form', { onSubmit: handleSubmit, className: 'space-y-4' },
        mode === 'register' && React.createElement('div', null,
          React.createElement('label', { className: 'block text-xs font-semibold text-wine-light mb-1.5 uppercase tracking-wide' }, 'Nombre'),
          React.createElement('input', {
            type: 'text', value: name, onChange: e => setName(e.target.value),
            placeholder: 'Tu nombre',
            className: 'w-full bg-panel border border-border rounded-xl px-4 py-3 text-wine placeholder-wine/40 focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all'
          })
        ),
        React.createElement('div', null,
          React.createElement('label', { className: 'block text-xs font-semibold text-wine-light mb-1.5 uppercase tracking-wide' }, 'Email'),
          React.createElement('input', {
            type: 'email', value: email, onChange: e => setEmail(e.target.value),
            placeholder: 'tu@email.com',
            className: 'w-full bg-panel border border-border rounded-xl px-4 py-3 text-wine placeholder-wine/40 focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all'
          })
        ),
        error && React.createElement('p', { className: 'text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg border border-red-200' }, error),
        React.createElement('button', {
          type: 'submit', disabled: loading,
          className: 'w-full gradient-accent text-white py-3 rounded-xl font-semibold hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 mt-2'
        }, loading ? 'Cargando...' : mode === 'login' ? 'Entrar' : 'Crear cuenta')
      ),
      React.createElement('p', { className: 'text-center text-xs text-wine/50 mt-6' },
        'Acceso seguro sin contraseña. Solo tu email.')
    )
  );
}

// ═══════════════════════════════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════════════════════════════
function Sidebar({ view, setView, onShowAuth }) {
  const { user, logout, isPro } = useAuth();
  const navItems = [
    { id: 'calendar', label: 'Agenda',  icon: 'calendar' },
    { id: 'chat',     label: 'Chat IA', icon: 'chat'     },
  ];
  return React.createElement('aside', {
    className: 'w-56 bg-sidebar h-full flex flex-col border-r border-border flex-shrink-0'
  },
    // ── Logo ──────────────────────────────────────────────────
    React.createElement('div', { className: 'p-5 border-b border-border' },
      React.createElement('div', { className: 'flex items-center gap-3' },
        React.createElement('div', {
          className: 'w-10 h-10 rounded-xl gradient-accent flex items-center justify-center'
        },
          React.createElement(LogoIcon, { size: 26, className: 'text-white' })
        ),
        React.createElement('div', null,
          React.createElement('h1', { className: 'font-bold text-wine text-sm leading-tight' }, 'Secretario IA'),
          React.createElement('p',  { className: 'text-wine/50 text-xs' }, 'v3.0')
        )
      )
    ),
    // ── Nav ───────────────────────────────────────────────────
    React.createElement('nav', { className: 'flex-1 p-3 space-y-1' },
      navItems.map(item =>
        React.createElement('button', {
          key: item.id, onClick: () => setView(item.id),
          className: `w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
            view === item.id
              ? 'bg-wine text-cream shadow-sm'
              : 'text-wine hover:bg-wine/10'}`
        },
          React.createElement(Icon, { name: item.icon, size: 16 }), item.label)
      ),
      React.createElement('div', { className: 'my-3 border-t border-border' }),
      React.createElement('button', {
        onClick: () => setView('pricing'),
        className: `w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
          view === 'pricing' ? 'bg-wine text-cream' : 'text-wine hover:bg-wine/10'}`
      },
        React.createElement(Icon, { name: 'star', size: 16 }), 'Planes')
    ),
    // ── User / Pro badge ──────────────────────────────────────
    React.createElement('div', { className: 'p-3 border-t border-border space-y-2' },
      user && isPro() && React.createElement('div', {
        className: 'flex items-center gap-2 px-3 py-2 bg-accent/10 rounded-xl'
      },
        React.createElement(Icon, { name: 'lightning', size: 14, className: 'text-accent' }),
        React.createElement('span', { className: 'text-xs font-semibold text-accent' }, 'Plan PRO activo')
      ),
      user
        ? React.createElement('div', { className: 'space-y-1' },
            React.createElement('div', { className: 'px-3 py-2 bg-panel rounded-xl' },
              React.createElement('p', { className: 'text-xs font-semibold text-wine truncate' }, user.name),
              React.createElement('p', { className: 'text-xs text-wine/50 truncate' }, user.email)
            ),
            React.createElement('button', {
              onClick: logout,
              className: 'w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-wine/60 hover:bg-wine/10 hover:text-wine transition-all'
            },
              React.createElement(Icon, { name: 'logout', size: 14 }), 'Cerrar sesión')
          )
        : React.createElement('button', {
            onClick: onShowAuth,
            className: 'w-full gradient-accent text-white py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-all'
          }, 'Iniciar sesión')
    )
  );
}

// ═══════════════════════════════════════════════════════════════
// CALENDAR VIEW
// ═══════════════════════════════════════════════════════════════
function CalendarView() {
  const { user } = useAuth();
  const [events,       setEvents]       = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading,      setLoading]      = useState(false);
  const [showForm,     setShowForm]     = useState(false);
  const [newEvent,     setNewEvent]     = useState({ title: '', date: '', time: '', duration_minutes: 60, event_type: 'general' });
  const { show, ToastEl } = useToast();

  const today        = new Date();
  const currentMonth = selectedDate.getMonth();
  const currentYear  = selectedDate.getFullYear();

  useEffect(() => { if (user) fetchEvents(); }, [user, selectedDate]);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const firstDay = new Date(currentYear, currentMonth,     1).toISOString().split('T')[0];
      const lastDay  = new Date(currentYear, currentMonth + 1, 0).toISOString().split('T')[0];
      const data = await api.get(`/api/events?date_from=${firstDay}&date_to=${lastDay}`);
      setEvents(data.events || []);
    } catch(e) { show(e.message, 'error'); }
    finally    { setLoading(false); }
  };

  const createEvent = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/events', newEvent);
      show('Evento creado ✅', 'success');
      setShowForm(false);
      setNewEvent({ title: '', date: '', time: '', duration_minutes: 60, event_type: 'general' });
      fetchEvents();
    } catch(err) { show(err.message, 'error'); }
  };

  const deleteEvent = async (id) => {
    try { await api.del('/api/events/' + id); show('Evento eliminado', 'info'); fetchEvents(); }
    catch(err) { show(err.message, 'error'); }
  };

  const getDaysInMonth  = (y, m) => new Date(y, m + 1, 0).getDate();
  const getFirstDayOfMonth = (y, m) => new Date(y, m, 1).getDay();
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay    = (getFirstDayOfMonth(currentYear, currentMonth) + 6) % 7;
  const totalCells  = Math.ceil((daysInMonth + firstDay) / 7) * 7;

  const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const dayNames   = ['Lu','Ma','Mi','Ju','Vi','Sa','Do'];

  const getEventsForDay = (day) => {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    return events.filter(e => e.start_time && e.start_time.startsWith(dateStr));
  };

  // Crimson-based event type colors
  const eventTypeColors = {
    general:  'bg-wine/70',
    medico:   'bg-red-500',
    trabajo:  'bg-blue-400',
    personal: 'bg-purple-400',
    deporte:  'bg-orange-400',
    reunion:  'bg-amber-500'
  };

  const selectedDayEvents = getEventsForDay(selectedDate.getDate());
  const prevMonth = () => setSelectedDate(new Date(currentYear, currentMonth - 1, 1));
  const nextMonth = () => setSelectedDate(new Date(currentYear, currentMonth + 1, 1));

  if (!user) return React.createElement('div', {
    className: 'flex-1 flex items-center justify-center bg-cream'
  },
    React.createElement('div', { className: 'text-center space-y-3' },
      React.createElement('div', {
        className: 'w-16 h-16 rounded-2xl gradient-accent flex items-center justify-center mx-auto'
      }, React.createElement(LogoIcon, { size: 36, className: 'text-white' })),
      React.createElement('h2', { className: 'text-xl font-bold text-wine' }, 'Tu Agenda Inteligente'),
      React.createElement('p',  { className: 'text-wine/60 text-sm' }, 'Inicia sesión para ver tus eventos')
    )
  );

  return React.createElement('div', { className: 'flex-1 flex overflow-hidden bg-cream' },
    // ── Calendar grid ──────────────────────────────────────────
    React.createElement('div', { className: 'flex-1 flex flex-col p-6 overflow-auto' },
      // Header
      React.createElement('div', { className: 'flex items-center justify-between mb-6' },
        React.createElement('div', { className: 'flex items-center gap-4' },
          React.createElement('button', { onClick: prevMonth, className: 'w-8 h-8 rounded-lg hover:bg-panel flex items-center justify-center text-wine transition-all' }, '‹'),
          React.createElement('h2', { className: 'text-xl font-bold text-wine' }, `${monthNames[currentMonth]} ${currentYear}`),
          React.createElement('button', { onClick: nextMonth, className: 'w-8 h-8 rounded-lg hover:bg-panel flex items-center justify-center text-wine transition-all' }, '›')
        ),
        React.createElement('div', { className: 'flex gap-2' },
          React.createElement('button', {
            onClick: () => setSelectedDate(new Date()),
            className: 'px-4 py-2 text-sm bg-panel hover:bg-border rounded-xl text-wine font-medium transition-all'
          }, 'Hoy'),
          React.createElement('button', {
            onClick: () => setShowForm(true),
            className: 'flex items-center gap-2 px-4 py-2 text-sm gradient-accent text-white rounded-xl font-medium hover:opacity-90 transition-all'
          }, React.createElement(Icon, { name: 'plus', size: 14 }), 'Nuevo evento')
        )
      ),
      // Day headers
      React.createElement('div', { className: 'grid grid-cols-7 gap-1 mb-1' },
        dayNames.map(d => React.createElement('div', { key: d, className: 'text-xs font-semibold text-wine/50 text-center py-2 uppercase tracking-wide' }, d))
      ),
      // Grid cells
      React.createElement('div', { className: 'grid grid-cols-7 gap-1 flex-1' },
        Array.from({ length: totalCells }, (_, i) => {
          const day    = i - firstDay + 1;
          const isValid    = day >= 1 && day <= daysInMonth;
          const isToday    = isValid && day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();
          const isSelected = isValid && day === selectedDate.getDate() && currentMonth === selectedDate.getMonth() && currentYear === selectedDate.getFullYear();
          const dayEvents  = isValid ? getEventsForDay(day) : [];
          return React.createElement('div', {
            key: i,
            onClick: () => isValid && setSelectedDate(new Date(currentYear, currentMonth, day)),
            className: `min-h-[80px] p-2 rounded-xl border transition-all cursor-pointer ${
              !isValid ? 'opacity-0 pointer-events-none' :
              isSelected ? 'bg-wine border-wine text-cream' :
              isToday    ? 'bg-accent/10 border-accent/40' :
                           'bg-panel/60 border-transparent hover:border-border hover:bg-panel'}`
          },
            isValid && React.createElement('div', null,
              React.createElement('span', {
                className: `text-sm font-semibold ${isSelected ? 'text-cream' : isToday ? 'text-accent' : 'text-wine'}`
              }, day),
              React.createElement('div', { className: 'mt-1 space-y-0.5' },
                dayEvents.slice(0, 2).map((ev, idx) =>
                  React.createElement('div', {
                    key: idx,
                    className: `text-[10px] px-1.5 py-0.5 rounded-md truncate font-medium ${
                      isSelected ? 'bg-white/20 text-cream' : (eventTypeColors[ev.event_type] || 'bg-wine/60') + ' text-white'}`
                  }, ev.title)
                ),
                dayEvents.length > 2 && React.createElement('div', {
                  className: `text-[10px] ${isSelected ? 'text-cream/70' : 'text-wine/50'}`
                }, `+${dayEvents.length - 2} más`)
              )
            )
          );
        })
      )
    ),
    // ── Day detail panel ───────────────────────────────────────
    React.createElement('div', { className: 'w-72 bg-panel border-l border-border flex flex-col overflow-hidden' },
      React.createElement('div', { className: 'p-4 border-b border-border' },
        React.createElement('h3', { className: 'font-bold text-wine' },
          selectedDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })),
        React.createElement('p', { className: 'text-wine/50 text-xs mt-0.5' },
          selectedDayEvents.length === 0 ? 'Sin eventos' : `${selectedDayEvents.length} evento${selectedDayEvents.length > 1 ? 's' : ''}`)
      ),
      React.createElement('div', { className: 'flex-1 overflow-auto p-4 space-y-2 chat-scroll' },
        selectedDayEvents.length === 0
          ? React.createElement('div', { className: 'text-center py-8 text-wine/40' },
              React.createElement(Icon, { name: 'calendar', size: 32, className: 'mx-auto mb-2 opacity-30' }),
              React.createElement('p', { className: 'text-sm' }, 'Día libre'))
          : selectedDayEvents.map(ev =>
              React.createElement('div', { key: ev.id, className: 'event-card bg-cream rounded-xl p-3 border border-border group' },
                React.createElement('div', { className: 'flex items-start justify-between' },
                  React.createElement('div', { className: 'flex-1 min-w-0' },
                    React.createElement('div', {
                      className: `inline-block text-[10px] px-2 py-0.5 rounded-full font-semibold mb-1 ${eventTypeColors[ev.event_type] || 'bg-wine/70'} text-white`
                    }, ev.event_type),
                    React.createElement('p', { className: 'text-sm font-semibold text-wine truncate' }, ev.title),
                    React.createElement('p', { className: 'text-xs text-wine/50 mt-0.5 flex items-center gap-1' },
                      React.createElement(Icon, { name: 'clock', size: 11 }),
                      new Date(ev.start_time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
                      ev.duration_minutes && ` · ${ev.duration_minutes} min`)
                  ),
                  React.createElement('button', {
                    onClick: () => deleteEvent(ev.id),
                    className: 'opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 rounded-lg text-red-400 transition-all'
                  }, React.createElement(Icon, { name: 'trash', size: 14 }))
                )
              )
            )
      )
    ),
    // ── New event form modal ───────────────────────────────────
    showForm && React.createElement('div', {
      className: 'fixed inset-0 z-40 flex items-center justify-center modal-overlay bg-black/30',
      onClick: e => e.target === e.currentTarget && setShowForm(false)
    },
      React.createElement('div', { className: 'bg-cream rounded-2xl p-6 w-full max-w-md shadow-2xl fade-in border border-border' },
        React.createElement('h3', { className: 'font-bold text-wine text-lg mb-5' }, 'Nuevo evento'),
        React.createElement('form', { onSubmit: createEvent, className: 'space-y-4' },
          React.createElement('input', {
            required: true, placeholder: 'Título del evento', value: newEvent.title,
            onChange: e => setNewEvent(p => ({ ...p, title: e.target.value })),
            className: 'w-full bg-panel border border-border rounded-xl px-4 py-3 text-wine placeholder-wine/40 focus:border-accent transition-all'
          }),
          React.createElement('div', { className: 'grid grid-cols-2 gap-3' },
            React.createElement('input', {
              required: true, type: 'date', value: newEvent.date,
              onChange: e => setNewEvent(p => ({ ...p, date: e.target.value })),
              className: 'bg-panel border border-border rounded-xl px-3 py-3 text-wine focus:border-accent transition-all'
            }),
            React.createElement('input', {
              required: true, type: 'time', value: newEvent.time,
              onChange: e => setNewEvent(p => ({ ...p, time: e.target.value })),
              className: 'bg-panel border border-border rounded-xl px-3 py-3 text-wine focus:border-accent transition-all'
            })
          ),
          React.createElement('div', { className: 'grid grid-cols-2 gap-3' },
            React.createElement('input', {
              type: 'number', placeholder: 'Duración (min)', value: newEvent.duration_minutes,
              onChange: e => setNewEvent(p => ({ ...p, duration_minutes: parseInt(e.target.value) })),
              className: 'bg-panel border border-border rounded-xl px-3 py-3 text-wine focus:border-accent transition-all'
            }),
            React.createElement('select', {
              value: newEvent.event_type,
              onChange: e => setNewEvent(p => ({ ...p, event_type: e.target.value })),
              className: 'bg-panel border border-border rounded-xl px-3 py-3 text-wine focus:border-accent transition-all'
            },
              ['general','medico','trabajo','personal','deporte','reunion'].map(t =>
                React.createElement('option', { key: t, value: t }, t.charAt(0).toUpperCase() + t.slice(1))
              )
            )
          ),
          React.createElement('div', { className: 'flex gap-3 pt-2' },
            React.createElement('button', {
              type: 'button', onClick: () => setShowForm(false),
              className: 'flex-1 py-3 rounded-xl border border-border text-wine font-medium hover:bg-panel transition-all'
            }, 'Cancelar'),
            React.createElement('button', {
              type: 'submit',
              className: 'flex-1 gradient-accent text-white py-3 rounded-xl font-medium hover:opacity-90 transition-all'
            }, 'Crear evento')
          )
        )
      )
    ),
    ToastEl
  );
}

// ═══════════════════════════════════════════════════════════════
// CHAT PANEL
// ═══════════════════════════════════════════════════════════════
function ChatPanel() {
  const { user, isPro } = useAuth();
  const [messages, setMessages] = useState([{
    role: 'assistant',
    content: '¡Hola! Soy tu secretario IA. Puedo ayudarte a:\n\n📅 Crear y organizar eventos\n🏋️ Planificar entrenamientos\n🔍 Consultar tu agenda\n\n¿Qué necesitas hoy?'
  }]);
  const [input,    setInput]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [msgCount, setMsgCount] = useState(0);
  const chatRef  = useRef(null);
  const inputRef = useRef(null);
  const { show, ToastEl } = useToast();

  // Weekly limit: 20 messages
  const FREE_LIMIT = 20;

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  // Helper: friendly error messages
  const friendlyError = (err) => {
    if (!err) return 'Error desconocido. Inténtalo de nuevo.';
    const msg = err.message || '';
    if (msg.includes('OPENAI') || msg.includes('OpenAI') || msg.includes('API key'))
      return '⚙️ La IA no está configurada aún. El administrador debe añadir la clave OpenAI.';
    if (msg.includes('semanal') || msg.includes('límite'))
      return `🔒 Límite semanal alcanzado (${FREE_LIMIT} mensajes/semana). Actualiza a PRO.`;
    if (msg.includes('autenticad') || err.status === 401)
      return '🔑 Sesión expirada. Por favor, inicia sesión de nuevo.';
    if (err.status === 500)
      return '⚙️ Error interno del servidor. Inténtalo en unos instantes.';
    return msg || 'Lo siento, hubo un error. Inténtalo de nuevo.';
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    if (!user) { show('Inicia sesión para usar el chat', 'info'); return; }
    if (!isPro() && msgCount >= FREE_LIMIT) {
      show('Has alcanzado los 20 mensajes semanales del plan gratuito.', 'error'); return;
    }
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);
    setMsgCount(c => c + 1);
    try {
      const data = await api.post('/api/chat', { message: userMsg });
      setMessages(prev => [...prev, { role: 'assistant', content: data.response, intent: data.intent }]);
    } catch(err) {
      const errText = friendlyError(err);
      setMessages(prev => [...prev, { role: 'assistant', content: errText, error: true }]);
      // If limit exceeded from server side, update counter
      if (err.data?.limit) setMsgCount(err.data.used || FREE_LIMIT);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const suggestions = [
    'Tengo dentista el viernes a las 11:00',
    'Montame un plan de entrenamiento de 4 semanas',
    '¿Qué tengo esta semana?',
    'Cancela la reunión del lunes'
  ];

  const intentBadge = (intent) => {
    const map = {
      crear_evento: { label: 'Evento',   color: 'bg-wine/20 text-wine' },
      crear_plan:   { label: 'Plan',     color: 'bg-blue-100 text-blue-700' },
      consultar:    { label: 'Consulta', color: 'bg-amber-100 text-amber-700' },
      modificar:    { label: 'Modificar',color: 'bg-purple-100 text-purple-700' },
    };
    return map[intent];
  };

  if (!user) return React.createElement('div', {
    className: 'flex-1 flex flex-col items-center justify-center bg-cream p-8 space-y-4'
  },
    React.createElement('div', { className: 'w-20 h-20 rounded-3xl gradient-accent flex items-center justify-center' },
      React.createElement(LogoIcon, { size: 44, className: 'text-white' })
    ),
    React.createElement('h2', { className: 'text-xl font-bold text-wine text-center' }, 'Chat con tu IA'),
    React.createElement('p',  { className: 'text-wine/60 text-sm text-center max-w-xs' },
      'Inicia sesión para hablar con tu asistente personal inteligente')
  );

  const remaining = FREE_LIMIT - msgCount;

  return React.createElement('div', { className: 'flex-1 flex flex-col bg-cream overflow-hidden' },
    // ── Header ─────────────────────────────────────────────────
    React.createElement('div', { className: 'px-6 py-4 border-b border-border flex items-center justify-between bg-cream' },
      React.createElement('div', { className: 'flex items-center gap-3' },
        React.createElement('div', { className: 'w-9 h-9 rounded-xl gradient-accent flex items-center justify-center' },
          React.createElement(LogoIcon, { size: 22, className: 'text-white' })
        ),
        React.createElement('div', null,
          React.createElement('h2', { className: 'font-bold text-wine text-sm' }, 'Secretario IA'),
          React.createElement('div', { className: 'flex items-center gap-1.5' },
            React.createElement('div', { className: 'w-2 h-2 rounded-full bg-accent animate-pulse' }),
            React.createElement('span', { className: 'text-xs text-wine/50' }, 'En línea')
          )
        )
      ),
      !isPro() && React.createElement('div', { className: 'text-xs text-wine/50 bg-panel px-3 py-1.5 rounded-xl' },
        React.createElement('span', { className: 'font-semibold text-wine' }, msgCount),
        `/${FREE_LIMIT} mensajes esta semana`
      )
    ),
    // ── Messages ───────────────────────────────────────────────
    React.createElement('div', { ref: chatRef, className: 'flex-1 overflow-auto px-6 py-4 space-y-4 chat-scroll' },
      messages.map((msg, i) =>
        React.createElement('div', { key: i, className: `flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} fade-in` },
          React.createElement('div', {
            className: `max-w-[80%] ${
              msg.role === 'user' ? 'bg-wine text-cream rounded-2xl rounded-br-md' :
              msg.error ? 'bg-red-50 border border-red-200 text-red-700 rounded-2xl rounded-bl-md' :
                          'bg-panel text-wine rounded-2xl rounded-bl-md'
            } px-4 py-3 text-sm leading-relaxed`
          },
            msg.intent && intentBadge(msg.intent) &&
              React.createElement('div', {
                className: `inline-block text-xs px-2 py-0.5 rounded-full mb-2 font-semibold ${intentBadge(msg.intent).color}`
              }, intentBadge(msg.intent).label),
            React.createElement('p', { className: 'whitespace-pre-line' }, msg.content)
          )
        )
      ),
      loading && React.createElement('div', { className: 'flex justify-start fade-in' },
        React.createElement('div', { className: 'bg-panel rounded-2xl rounded-bl-md px-4 py-3' },
          React.createElement('div', { className: 'flex gap-1 items-center h-5' },
            [1,2,3].map(n => React.createElement('div', { key: n, className: 'w-2 h-2 bg-wine/40 rounded-full typing-dot' }))
          )
        )
      )
    ),
    // ── Suggestions ────────────────────────────────────────────
    messages.length <= 2 && React.createElement('div', { className: 'px-6 pb-2' },
      React.createElement('div', { className: 'flex flex-wrap gap-2' },
        suggestions.map((s, i) =>
          React.createElement('button', {
            key: i, onClick: () => { setInput(s); inputRef.current?.focus(); },
            className: 'text-xs bg-panel hover:bg-border text-wine px-3 py-1.5 rounded-xl transition-all border border-border hover:border-accent/40'
          }, s)
        )
      )
    ),
    // ── Limit warning ──────────────────────────────────────────
    !isPro() && msgCount >= FREE_LIMIT - 3 && React.createElement('div', {
      className: 'mx-6 mb-2 p-3 bg-wine/5 border border-wine/20 rounded-xl'
    },
      React.createElement('p', { className: 'text-xs text-wine/70 text-center' },
        msgCount >= FREE_LIMIT
          ? '🔒 Límite semanal alcanzado. '
          : `⚠️ Te quedan ${remaining} mensajes esta semana. `,
        React.createElement('a', {
          href: '#', onClick: e => { e.preventDefault(); },
          className: 'font-semibold text-accent underline'
        }, 'Actualiza a PRO')
      )
    ),
    // ── Input area ─────────────────────────────────────────────
    React.createElement('div', { className: 'px-6 pb-6 pt-2' },
      React.createElement('div', {
        className: 'flex items-end gap-3 bg-panel rounded-2xl border border-border p-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 transition-all'
      },
        React.createElement('textarea', {
          ref: inputRef, value: input,
          onChange: e => setInput(e.target.value),
          onKeyDown: handleKey,
          placeholder: isPro() ? 'Escribe algo... (Enter para enviar)' : `${remaining} mensajes restantes esta semana...`,
          disabled: loading || (!isPro() && msgCount >= FREE_LIMIT),
          rows: 1,
          className: 'flex-1 bg-transparent text-wine placeholder-wine/40 text-sm resize-none focus:outline-none disabled:opacity-50',
          style: { maxHeight: '120px' }
        }),
        React.createElement('button', {
          onClick: sendMessage,
          disabled: loading || !input.trim() || (!isPro() && msgCount >= FREE_LIMIT),
          className: 'w-9 h-9 rounded-xl gradient-accent flex items-center justify-center text-white hover:opacity-90 disabled:opacity-40 transition-all flex-shrink-0'
        }, React.createElement(Icon, { name: 'send', size: 16 }))
      )
    ),
    ToastEl
  );
}

// ═══════════════════════════════════════════════════════════════
// PRICING PAGE
// ═══════════════════════════════════════════════════════════════
function PricingPage({ onShowAuth }) {
  const { user, isPro } = useAuth();
  const [loading, setLoading] = useState('');
  const { show, ToastEl } = useToast();

  const plans = [
    {
      id: 'free', name: 'Gratuito', price: '0€', period: 'para siempre',
      description: 'Empieza a organizar tu agenda con IA',
      color: 'border-border', badge: null,
      features: [
        { ok: true,  text: '20 mensajes de IA por semana' },
        { ok: true,  text: '20 eventos en el calendario' },
        { ok: true,  text: 'Clasificación de intenciones' },
        { ok: true,  text: 'Creación básica de eventos' },
        { ok: false, text: 'Planes de entrenamiento IA' },
        { ok: false, text: 'Scheduler automático' },
        { ok: false, text: 'Memoria personalizada' },
        { ok: false, text: 'Emails de confirmación' },
        { ok: false, text: 'Soporte prioritario' }
      ],
      cta: 'Empezar gratis', ctaStyle: 'border-2 border-border text-wine hover:bg-panel'
    },
    {
      id: 'pro', name: 'PRO', price: '9€', period: '/ mes',
      description: 'Para personas que quieren el máximo de productividad',
      color: 'border-accent', badge: 'Más popular',
      features: [
        { ok: true, text: 'IA ilimitada (sin restricciones)' },
        { ok: true, text: 'Eventos ilimitados' },
        { ok: true, text: 'Planes de entrenamiento con IA' },
        { ok: true, text: 'Scheduler inteligente automático' },
        { ok: true, text: 'Memoria personalizada a largo plazo' },
        { ok: true, text: 'Emails de confirmación y resúmenes' },
        { ok: true, text: 'Análisis de disponibilidad' },
        { ok: true, text: 'Anti-solapamiento de eventos' },
        { ok: true, text: 'Soporte prioritario' }
      ],
      cta: isPro() ? 'Plan activo ✓' : 'Suscribirse — 9€/mes',
      ctaStyle: 'gradient-accent text-white hover:opacity-90'
    },
    {
      id: 'premium', name: 'Premium', price: '19€', period: '/ mes',
      description: 'Para equipos y usuarios con necesidades avanzadas',
      color: 'border-wine/40', badge: 'Próximamente',
      features: [
        { ok: true, text: 'Todo lo del plan PRO' },
        { ok: true, text: 'Múltiples calendarios' },
        { ok: true, text: 'Integración con Google Calendar' },
        { ok: true, text: 'Recordatorios SMS / WhatsApp' },
        { ok: true, text: 'Reportes semanales automáticos' },
        { ok: true, text: 'API personalizada' },
        { ok: true, text: 'Hasta 3 usuarios' },
        { ok: true, text: 'Onboarding personalizado' },
        { ok: true, text: 'SLA garantizado' }
      ],
      cta: 'Lista de espera', ctaStyle: 'border-2 border-wine/30 text-wine hover:bg-wine/5'
    }
  ];

  const handleSubscribe = async (planId) => {
    if (planId === 'free')    { if (!user) onShowAuth(); return; }
    if (planId === 'premium') { show('¡Anotado! Te avisamos cuando esté disponible 🚀', 'success'); return; }
    if (!user)    { onShowAuth(); return; }
    if (isPro())  { show('Ya tienes el plan PRO activo', 'info'); return; }
    setLoading(planId);
    try {
      const data = await api.get('/api/stripe/checkout');
      if (data.url) window.open(data.url, '_blank');
    } catch(err) {
      show('Error al procesar el pago. Stripe no configurado aún.', 'error');
    } finally { setLoading(''); }
  };

  return React.createElement('div', { className: 'flex-1 overflow-auto bg-cream p-8 chat-scroll' },
    // Header
    React.createElement('div', { className: 'text-center max-w-2xl mx-auto mb-12' },
      React.createElement('div', {
        className: 'inline-flex items-center gap-2 bg-accent/10 text-accent px-4 py-2 rounded-full text-sm font-semibold mb-4'
      },
        React.createElement(Icon, { name: 'star', size: 16 }), 'Pricing transparente'
      ),
      React.createElement('h2', { className: 'text-4xl font-bold text-wine mb-4' }, 'Elige tu plan'),
      React.createElement('p',  { className: 'text-wine/60 text-lg' }, 'Sin compromisos. Cancela cuando quieras. Primer mes garantizado.')
    ),
    // Plans grid
    React.createElement('div', { className: 'max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 mb-12' },
      plans.map(plan =>
        React.createElement('div', {
          key: plan.id,
          className: `relative bg-panel rounded-2xl p-6 border-2 ${plan.color} flex flex-col ${plan.id === 'pro' ? 'shadow-xl scale-105' : ''}`
        },
          plan.badge && React.createElement('div', {
            className: `absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold ${
              plan.badge === 'Más popular' ? 'bg-accent text-white' : 'bg-wine text-cream'}`
          }, plan.badge),
          React.createElement('div', { className: 'mb-6' },
            React.createElement('h3', { className: 'text-lg font-bold text-wine mb-1' }, plan.name),
            React.createElement('div', { className: 'flex items-baseline gap-1 mb-2' },
              React.createElement('span', { className: 'text-4xl font-bold text-wine' }, plan.price),
              React.createElement('span', { className: 'text-wine/50 text-sm' }, plan.period)
            ),
            React.createElement('p', { className: 'text-wine/60 text-sm' }, plan.description)
          ),
          React.createElement('ul', { className: 'flex-1 space-y-2.5 mb-6' },
            plan.features.map((f, i) =>
              React.createElement('li', { key: i, className: 'flex items-start gap-2.5' },
                React.createElement('div', {
                  className: `w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    f.ok ? 'bg-accent/20 text-accent' : 'bg-wine/10 text-wine/30'}`
                },
                  f.ok ? React.createElement(Icon, { name: 'check', size: 10 })
                       : React.createElement('span', { style: { fontSize: '10px' } }, '×')
                ),
                React.createElement('span', { className: `text-sm ${f.ok ? 'text-wine' : 'text-wine/40'}` }, f.text)
              )
            )
          ),
          React.createElement('button', {
            onClick: () => handleSubscribe(plan.id),
            disabled: loading === plan.id || (plan.id === 'pro' && isPro()),
            className: `w-full py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-60 ${plan.ctaStyle}`
          }, loading === plan.id ? 'Procesando...' : plan.cta)
        )
      )
    ),
    // FAQ
    React.createElement('div', { className: 'max-w-2xl mx-auto' },
      React.createElement('h3', { className: 'text-xl font-bold text-wine text-center mb-6' }, 'Preguntas frecuentes'),
      React.createElement('div', { className: 'space-y-3' },
        [
          ['¿Puedo cancelar en cualquier momento?', 'Sí. Sin permanencia. Cancela desde el portal de cliente con un clic.'],
          ['¿Cómo funciona el plan gratuito?', 'Tienes 20 mensajes de IA por semana y hasta 20 eventos. Sin tarjeta de crédito.'],
          ['¿Qué pasa con mis datos si cancelo?', 'Tus datos se conservan 30 días tras la cancelación. Puedes exportarlos.'],
          ['¿El scheduler automático es realmente inteligente?', 'Sí — analiza tu disponibilidad real, evita solapamientos y distribuye sesiones en el tiempo óptimo.']
        ].map(([q, a], i) =>
          React.createElement('details', { key: i, className: 'bg-panel rounded-xl border border-border group' },
            React.createElement('summary', { className: 'px-5 py-4 font-semibold text-wine cursor-pointer text-sm list-none flex items-center justify-between' },
              q, React.createElement('span', { className: 'text-wine/40 group-open:rotate-90 transition-transform text-lg' }, '›')
            ),
            React.createElement('p', { className: 'px-5 pb-4 text-sm text-wine/60 border-t border-border pt-3' }, a)
          )
        )
      )
    ),
    ToastEl
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════
function App() {
  const { user, loading } = useAuth();
  const [view,     setView]     = useState('calendar');
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      setTimeout(() => alert('🎉 ¡Suscripción activada! Bienvenido a PRO.'), 500);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  if (loading) return React.createElement('div', { className: 'h-screen flex items-center justify-center bg-cream' },
    React.createElement('div', { className: 'text-center space-y-3' },
      React.createElement('div', { className: 'w-14 h-14 rounded-2xl gradient-accent flex items-center justify-center mx-auto' },
        React.createElement(LogoIcon, { size: 32, className: 'text-white animate-pulse' })
      ),
      React.createElement('p', { className: 'text-wine/60 text-sm' }, 'Cargando...')
    )
  );

  const renderView = () => {
    switch (view) {
      case 'calendar': return React.createElement(CalendarView);
      case 'chat':     return React.createElement(ChatPanel);
      case 'pricing':  return React.createElement(PricingPage, { onShowAuth: () => setShowAuth(true) });
      default:         return React.createElement(CalendarView);
    }
  };

  return React.createElement('div', { className: 'h-screen flex overflow-hidden' },
    React.createElement(Sidebar, { view, setView, onShowAuth: () => setShowAuth(true) }),
    React.createElement('main', { className: 'flex-1 flex flex-col overflow-hidden' },
      React.createElement('div', { className: 'flex-1 flex overflow-hidden' }, renderView())
    ),
    showAuth && !user && React.createElement(AuthModal, { onClose: () => setShowAuth(false) })
  );
}

// ── Bootstrap ─────────────────────────────────────────────────
const root = ReactDOM.createRoot(document.getElementById('app'));
root.render(React.createElement(AuthProvider, null, React.createElement(App)));
