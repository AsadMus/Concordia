// ConChordia front-end API helper.
// Include on any page with:  <script src="js/api.js"></script>
// Then call e.g.  const contacts = await api.get('/contacts');
const api = (() => {
  const BASE = '/api';

  async function request(method, path, body) {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(localStorage.getItem('token') && { Authorization: 'Bearer ' + localStorage.getItem('token') }),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 && !path.startsWith('/auth/')) {
      logout(); // token missing/expired -> back to login
      return;
    }
    const data = res.status === 204 ? null : await res.json();
    if (!res.ok) throw new Error(data?.error || 'Request failed');
    return data;
  }

  async function login(loginValue, password) {
    const data = await request('POST', '/auth/login', { login: loginValue, password });
    localStorage.setItem('token', data.token);
    return data.user;
  }

  async function signup(fields) {
    const data = await request('POST', '/auth/signup', fields);
    localStorage.setItem('token', data.token);
    return data.user;
  }

  function logout() {
    localStorage.removeItem('token');
    window.location.href = 'login.html';
  }

  // Call at the top of every logged-in page (dashboard, contacts, ...)
  function requireLogin() {
    if (!localStorage.getItem('token')) window.location.href = 'login.html';
  }

  return {
    get: (p) => request('GET', p),
    post: (p, b) => request('POST', p, b),
    put: (p, b) => request('PUT', p, b),
    patch: (p, b) => request('PATCH', p, b),
    del: (p) => request('DELETE', p),
    login, signup, logout, requireLogin,
  };
})();
