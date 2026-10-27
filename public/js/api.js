function getToken() { return localStorage.getItem('token'); }
function getUser() { return JSON.parse(localStorage.getItem('user') || 'null'); }
function setAuth(token, user) {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
}
function clearAuth() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
}

async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const res = await fetch(path, { ...options, headers });
    if (res.status === 401) {
        clearAuth();
        location.href = 'login.html';
        throw new Error('未登录');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || '请求失败');
    return data;
}

function requireLogin(role) {
    const u = getUser();
    if (!getToken() || !u) { location.href = 'login.html'; return null; }
    if (role && u.role !== role) {
        alert('无权限访问该页面');
        location.href = 'index.html';
        return null;
    }
    return u;
}

function logout() {
    clearAuth();
    location.href = 'login.html';
}