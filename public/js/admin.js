// Admin Panel JavaScript for Kirinyaga University RPS Game
let adminToken = null;
let currentAdmin = null;
let refreshInterval = null;

// DOM Elements
const adminLoginView = document.getElementById('adminLoginView');
const adminDashboard = document.getElementById('adminDashboard');

// Show notification function
function showNotification(message, isError = false) {
    const msgDiv = document.getElementById('adminLoginMessage');
    if (msgDiv) {
        msgDiv.innerHTML = `<div class="${isError ? 'error-msg' : 'success-msg'}" style="padding: 12px; margin: 10px 0; border-radius: 8px; background: ${isError ? 'rgba(255,75,43,0.2)' : 'rgba(0,255,136,0.2)'}; border: 1px solid ${isError ? '#ff4b2b' : '#00ff88'};">
            <i class="fas ${isError ? 'fa-exclamation-triangle' : 'fa-check-circle'}"></i> ${message}
        </div>`;
        setTimeout(() => msgDiv.innerHTML = '', 5000);
    }
}

// Admin Login Function
async function adminLogin(username, password) {
    if (!username || !password) {
        showNotification('Please enter both username and password', true);
        return;
    }
    
    try {
        showNotification('Authenticating...', false);
        
        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            adminToken = data.token;
            currentAdmin = data.admin;
            localStorage.setItem('adminToken', adminToken);
            localStorage.setItem('adminData', JSON.stringify(currentAdmin));
            showNotification(`Welcome back, ${currentAdmin.username}!`, false);
            showAdminDashboard();
            loadAdminData();
            startAutoRefresh();
        } else {
            showNotification(data.error || 'Invalid admin credentials', true);
        }
    } catch (error) {
        console.error('Admin login error:', error);
        showNotification('Connection error. Please try again.', true);
    }
}

// Admin Logout
async function adminLogout() {
    try {
        if (refreshInterval) {
            clearInterval(refreshInterval);
            refreshInterval = null;
        }
        
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminData');
        adminToken = null;
        currentAdmin = null;
        
        if (adminDashboard) adminDashboard.classList.add('hidden');
        if (adminLoginView) adminLoginView.classList.remove('hidden');
        
        const passwordField = document.getElementById('adminPassword');
        if (passwordField) passwordField.value = '';
        
        showNotification('Logged out successfully', false);
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// Show Admin Dashboard
function showAdminDashboard() {
    if (adminLoginView) adminLoginView.classList.add('hidden');
    if (adminDashboard) adminDashboard.classList.remove('hidden');
    if (currentAdmin && document.getElementById('adminName')) {
        document.getElementById('adminName').textContent = currentAdmin.username;
    }
}

// Load all admin data
async function loadAdminData() {
    if (!adminToken) {
        console.error('No admin token found');
        return;
    }
    
    try {
        await loadUsers();
        await loadOnlineCount();
        await loadTotalUsers();
        await loadReports();
        await loadActivityLog();
        updateActiveGames();
    } catch (error) {
        console.error('Load admin data error:', error);
        showNotification('Failed to load some data', true);
    }
}

// Load all users
async function loadUsers() {
    try {
        const response = await fetch('/api/admin/users', {
            headers: { 
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) throw new Error('Failed to load users');
        
        const users = await response.json();
        const usersTableBody = document.getElementById('usersTableBody');
        
        if (!usersTableBody) return;
        
        usersTableBody.innerHTML = '';
        
        users.forEach(user => {
            const row = usersTableBody.insertRow();
            const badgeClass = getBadgeClass(user.badge);
            const statusClass = user.is_banned ? 'offline-badge' : 'online-badge';
            const statusText = user.is_banned ? 'BANNED' : 'ACTIVE';
            
            row.innerHTML = `
                <td style="padding: 10px;">${user.id}</td>
                <td style="padding: 10px;"><i class="fas fa-user"></i> ${escapeHtml(user.username)}</td>
                <td style="padding: 10px;">${escapeHtml(user.email)}</td>
                <td style="padding: 10px;"><span class="badge ${badgeClass}">${user.badge}</span></td>
                <td style="padding: 10px;">${user.total_wins || 0}</td>
                <td style="padding: 10px;" class="${statusClass}"><i class="fas ${user.is_banned ? 'fa-ban' : 'fa-circle'}"></i> ${statusText}</td>
                <td style="padding: 10px;">
                    <button onclick="toggleBan(${user.id}, ${!user.is_banned})" class="btn-small ${user.is_banned ? 'btn-success' : 'btn-danger'}" style="margin: 2px;">
                        <i class="fas ${user.is_banned ? 'fa-check' : 'fa-ban'}"></i> ${user.is_banned ? 'Unban' : 'Ban'}
                    </button>
                </td>
            `;
        });
        
        const badgeUserSelect = document.getElementById('badgeUserSelect');
        if (badgeUserSelect) {
            const nonAdminUsers = users.filter(u => u.role !== 'admin');
            badgeUserSelect.innerHTML = '<option value="">Select User</option>' + 
                nonAdminUsers.map(u => `<option value="${u.id}">${escapeHtml(u.username)} (Current: ${u.badge})</option>`).join('');
        }
        
    } catch (error) {
        console.error('Load users error:', error);
        showNotification('Failed to load users', true);
    }
}

// Get badge CSS class
function getBadgeClass(badge) {
    const badgeMap = {
        'Novice': 'badge-novice',
        'Skilled': 'badge-skilled',
        'Adept': 'badge-adept',
        'Master': 'badge-master',
        'Legend': 'badge-legend'
    };
    return badgeMap[badge] || 'badge-novice';
}

// Load online users count
async function loadOnlineCount() {
    try {
        const response = await fetch('/api/admin/online-count', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            const onlineCountElem = document.getElementById('onlineCount');
            if (onlineCountElem) onlineCountElem.textContent = data.count || 0;
        }
    } catch (error) {
        console.error('Load online count error:', error);
    }
}

// Load total registered users
async function loadTotalUsers() {
    try {
        const response = await fetch('/api/admin/total-users', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            const totalUsersElem = document.getElementById('totalUsers');
            if (totalUsersElem) totalUsersElem.textContent = data.count || 0;
        }
    } catch (error) {
        console.error('Load total users error:', error);
    }
}

// Load abuse reports
async function loadReports() {
    try {
        const response = await fetch('/api/admin/reports', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        
        if (response.ok) {
            const reports = await response.json();
            const reportsList = document.getElementById('reportsList');
            const reportCountElem = document.getElementById('reportCount');
            
            if (reportCountElem) reportCountElem.textContent = reports.length;
            
            if (reportsList) {
                if (reports.length === 0) {
                    reportsList.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">No reports submitted yet</div>';
                } else {
                    reportsList.innerHTML = reports.map(r => `
                        <div style="padding: 12px; border-bottom: 1px solid rgba(0,242,255,0.2);">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <strong style="color: #ff4b2b;">${escapeHtml(r.reported_name)}</strong> 
                                    reported by <strong>${escapeHtml(r.reporter_name)}</strong>
                                </div>
                                <small style="color: #888;">${new Date(r.created_at).toLocaleString()}</small>
                            </div>
                            <div style="margin-top: 5px; padding-left: 10px; border-left: 2px solid cyan;">
                                Reason: ${escapeHtml(r.reason)}
                            </div>
                        </div>
                    `).join('');
                }
            }
        }
    } catch (error) {
        console.error('Load reports error:', error);
    }
}

// Load admin activity log
async function loadActivityLog() {
    try {
        const response = await fetch('/api/admin/activity-log', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        
        if (response.ok) {
            const logs = await response.json();
            const activityLog = document.getElementById('activityLog');
            
            if (activityLog) {
                if (logs.length === 0) {
                    activityLog.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">No activity logged yet</div>';
                } else {
                    activityLog.innerHTML = logs.map(log => `
                        <div style="padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                            <div style="display: flex; justify-content: space-between;">
                                <strong style="color: cyan;">${log.action}</strong>
                                <small>${new Date(log.created_at).toLocaleString()}</small>
                            </div>
                            <div style="font-size: 0.85rem; margin-top: 5px;">
                                Admin: ${escapeHtml(log.admin_name)} | ${log.details || 'No details'}
                            </div>
                        </div>
                    `).join('');
                }
            }
        }
    } catch (error) {
        console.error('Load activity log error:', error);
    }
}

// Update active games
function updateActiveGames() {
    const activeGamesElem = document.getElementById('activeGames');
    if (activeGamesElem) {
        const randomGames = Math.floor(Math.random() * 15);
        activeGamesElem.textContent = randomGames;
    }
}

// Toggle ban/unban user
window.toggleBan = async function(userId, ban) {
    if (!adminToken) {
        showNotification('Session expired. Please login again.', true);
        adminLogout();
        return;
    }
    
    const action = ban ? 'ban' : 'unban';
    if (!confirm(`Are you sure you want to ${action} this user?`)) return;
    
    try {
        const response = await fetch('/api/admin/ban-user', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({ userId, ban })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification(data.message, false);
            loadUsers();
        } else {
            showNotification(data.error || 'Failed to update user', true);
        }
    } catch (error) {
        console.error('Ban user error:', error);
        showNotification('Connection error', true);
    }
};

// Update user badge
async function updateBadge() {
    const userId = document.getElementById('badgeUserSelect').value;
    const badge = document.getElementById('assignBadgeSelect').value;
    
    if (!userId) {
        showNotification('Please select a user', true);
        return;
    }
    
    if (!adminToken) {
        showNotification('Session expired. Please login again.', true);
        adminLogout();
        return;
    }
    
    try {
        const response = await fetch('/api/admin/update-badge', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({ userId, badge })
        });
        
        if (response.ok) {
            showNotification(`Badge updated to ${badge} successfully!`, false);
            loadUsers();
        } else {
            const data = await response.json();
            showNotification(data.error || 'Failed to update badge', true);
        }
    } catch (error) {
        console.error('Update badge error:', error);
        showNotification('Connection error', true);
    }
}

// Clear all reports
async function clearReports() {
    if (!confirm('WARNING: This will permanently delete ALL abuse reports. Are you absolutely sure?')) return;
    
    if (!adminToken) {
        showNotification('Session expired. Please login again.', true);
        adminLogout();
        return;
    }
    
    try {
        const response = await fetch('/api/admin/clear-reports', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        
        if (response.ok) {
            showNotification('All reports cleared successfully', false);
            loadReports();
        } else {
            showNotification('Failed to clear reports', true);
        }
    } catch (error) {
        console.error('Clear reports error:', error);
        showNotification('Connection error', true);
    }
}

// Auto refresh data
function startAutoRefresh() {
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(() => {
        if (adminToken && document.getElementById('adminDashboard') && 
            !document.getElementById('adminDashboard').classList.contains('hidden')) {
            loadAdminData();
        }
    }, 30000);
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Check for existing session on page load
function checkExistingSession() {
    const savedToken = localStorage.getItem('adminToken');
    const savedAdmin = localStorage.getItem('adminData');
    
    if (savedToken && savedAdmin) {
        adminToken = savedToken;
        currentAdmin = JSON.parse(savedAdmin);
        
        fetch('/api/admin/users', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        }).then(response => {
            if (response.ok) {
                showAdminDashboard();
                loadAdminData();
                startAutoRefresh();
            } else {
                localStorage.removeItem('adminToken');
                localStorage.removeItem('adminData');
                adminToken = null;
                currentAdmin = null;
            }
        }).catch(() => {
            console.warn('Could not verify session');
        });
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('adminLoginBtn');
    if (loginBtn) {
        loginBtn.onclick = () => {
            const username = document.getElementById('adminUsername').value;
            const password = document.getElementById('adminPassword').value;
            adminLogin(username, password);
        };
    }
    
    const passwordField = document.getElementById('adminPassword');
    if (passwordField) {
        passwordField.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const username = document.getElementById('adminUsername').value;
                const password = document.getElementById('adminPassword').value;
                adminLogin(username, password);
            }
        });
    }
    
    const logoutBtn = document.getElementById('adminLogoutBtn');
    if (logoutBtn) {
        logoutBtn.onclick = adminLogout;
    }
    
    const updateBadgeBtn = document.getElementById('updateBadgeBtn');
    if (updateBadgeBtn) {
        updateBadgeBtn.onclick = updateBadge;
    }
    
    const clearReportsBtn = document.getElementById('clearReportsBtn');
    if (clearReportsBtn) {
        clearReportsBtn.onclick = clearReports;
    }
    
    checkExistingSession();
});