// ConChordia front-end API helper.
// Include on any page with:  <script src="js/api.js"></script>
// Then call e.g.  const contacts = await api.get('/contacts');
//
// Logged-in pages:  put  <script src="js/api.js"></script><script>api.requireLogin();</script>  in <head>
// Log out links:    give them a  data-logout  attribute, e.g.  <a href="#" data-logout>Log Out</a>
const api = (() => {
  const BASE = '/api';
  const TOKEN_KEY = 'token';

  const getToken = () => localStorage.getItem(TOKEN_KEY);

  // A JWT is three base64 parts; the middle one holds { sub, role, exp }.
  // We only read "exp" to skip pages early - the server still checks the real signature.
  function tokenIsValid(token = getToken()) {
    if (!token) return false;
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return !payload.exp || payload.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  }

  async function request(method, path, body) {
    const token = getToken();
    const res = await fetch(BASE + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: 'Bearer ' + token }),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    // 401 from anything except a login/signup attempt means the session is gone.
    if (res.status === 401 && path !== '/auth/login' && path !== '/auth/signup') {
      logout();
      return new Promise(() => {}); // page is navigating away; don't run the caller's code
    }
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || 'Request failed');
    return data;
  }

  // settings.html and network.html read the account from localStorage.
  // On those pages "role" means Artist/Manager, which the API calls accountType
  // (the API's own "role" is user/admin), so it is stored under both names here.
  function rememberAccount(user) {
    if (!user) return user;
    localStorage.setItem('conchordiaAccount', JSON.stringify({ ...user, role: user.accountType, systemRole: user.role }));
    localStorage.setItem('conchordiaAccountType', user.accountType || 'artist');
    return user;
  }

  async function login(loginValue, password) {
    const data = await request('POST', '/auth/login', { login: loginValue, password });
    localStorage.setItem(TOKEN_KEY, data.token);
    return rememberAccount(data.user);
  }

  async function signup(fields) {
    const data = await request('POST', '/auth/signup', fields);
    localStorage.setItem(TOKEN_KEY, data.token);
    return rememberAccount(data.user);
  }

  function clearSession() {
    ['conchordiaAccount', 'conchordiaAccountType', 'conchordiaToken'].forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem(TOKEN_KEY);
  }

  function logout() {
    clearSession();
    window.location.replace('login.html'); // replace = Back button can't return here
  }

  // Call at the top of every logged-in page (dashboard, contacts, ...)
  function requireLogin() {
    if (!tokenIsValid()) {
      clearSession();
      window.location.replace('login.html');
    }
  }

  // Call on login.html / signup.html: already logged in -> go straight to the dashboard.
  function redirectIfLoggedIn() {
    if (tokenIsValid()) window.location.replace('dashboard.html');
  }

  // Pressing Back after logging out can show a cached copy of the page.
  // Re-check whenever a protected page is shown again from that cache.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted && document.documentElement.dataset.protected === 'true') requireLogin();
  });

  // Any element with data-logout logs the user out when clicked.
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-logout]')) {
      event.preventDefault();
      logout();
    }
  });

  return {
    get: (p) => request('GET', p),
    post: (p, b) => request('POST', p, b),
    put: (p, b) => request('PUT', p, b),
    patch: (p, b) => request('PATCH', p, b),
    del: (p) => request('DELETE', p),
    login, signup, logout, rememberAccount,
    requireLogin: () => {
      document.documentElement.dataset.protected = 'true';
      requireLogin();
    },
    redirectIfLoggedIn,
  };
})();
