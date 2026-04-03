// Socket connection
const socket = io({
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
});

// Global variables
let currentUser = null;
let currentMatchCode = null;
let userScore = 0;
let computerScore = 0;
let userMoveHistory = [];
let refreshInterval = null;
let loginAudio = null;
// 10-Round Match Session
let currentSession = null;
let currentRound = 1;

async function createMatchSession() {
    const token = localStorage.getItem('token');
    const res = await fetch(`${BACKEND_URL}/api/match/session/create`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success) {
        currentSession = data.sessionCode;
        showNotification(`Session created! Code: ${data.sessionCode}`, 'success');
        document.getElementById('sessionCodeDisplay').innerText = data.sessionCode;
        document.getElementById('sessionInfo').classList.remove('hidden');
    }
}

async function joinMatchSession() {
    const code = document.getElementById('joinSessionCode').value.trim().toUpperCase();
    const token = localStorage.getItem('token');
    const res = await fetch(`${BACKEND_URL}/api/match/session/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ sessionCode: code })
    });
    const data = await res.json();
    if (data.success) {
        currentSession = code;
        showNotification(`Joined session! Best of 10 rounds against ${data.opponent}`, 'success');
        startSessionGame();
    } else {
        showNotification(data.error, 'error');
    }
}

async function makeSessionMove(move) {
    const token = localStorage.getItem('token');
    const res = await fetch(`${BACKEND_URL}/api/match/session/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ sessionCode: currentSession, move, roundNumber: currentRound })
    });
    const data = await res.json();
    
    if (data.type === 'round_complete') {
        showRoundResult(data.roundWinner, data.roundLoser);
        updateScoreboard(data.player1Wins, data.player2Wins, data.ties);
        currentRound = data.nextRound;
        document.getElementById('roundDisplay').innerText = `Round ${currentRound}/${data.totalRounds}`;
    } else if (data.type === 'session_complete') {
        showSessionComplete(data.winner, data.loser, data.player1Wins, data.player2Wins, data.ties);
        currentSession = null;
        currentRound = 1;
    }
}

function showRoundResult(winner, loser) {
    const popup = document.getElementById('resultPopup');
    const winnerSpan = document.getElementById('popupWinner');
    const loserSpan = document.getElementById('popupLoser');
    
    winnerSpan.innerText = winner;
    loserSpan.innerText = loser || 'None';
    popup.classList.remove('hidden');
    
    setTimeout(() => {
        popup.classList.add('hidden');
    }, 3000);
}

function showSessionComplete(winner, loser, p1Wins, p2Wins, ties) {
    const popup = document.getElementById('sessionCompletePopup');
    document.getElementById('sessionWinner').innerText = winner;
    document.getElementById('sessionLoser').innerText = loser || 'None';
    document.getElementById('sessionScore').innerText = `${p1Wins} - ${p2Wins} (Ties: ${ties})`;
    popup.classList.remove('hidden');
    
    setTimeout(() => {
        popup.classList.add('hidden');
    }, 5000);
}
// DOM Elements
const authView = document.getElementById('authView');
const userDashboard = document.getElementById('userDashboard');

// Password visibility toggle
function togglePasswordVisibility(inputId, iconId) {
    const passwordInput = document.getElementById(inputId);
    const toggleIcon = document.getElementById(iconId);
    
    if (passwordInput && toggleIcon) {
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            toggleIcon.className = 'fas fa-eye-slash';
        } else {
            passwordInput.type = 'password';
            toggleIcon.className = 'fas fa-eye';
        }
    }
}

// Show notification function
function showNotification(message, isError = false, targetId = 'authMsg') {
    const msgDiv = document.getElementById(targetId);
    if (msgDiv) {
        msgDiv.innerHTML = `<div class="${isError ? 'error-msg' : 'success-msg'}" style="padding: 12px; margin: 10px 0; border-radius: 8px; background: ${isError ? 'rgba(255,75,43,0.2)' : 'rgba(0,255,136,0.2)'}; border: 1px solid ${isError ? '#ff4b2b' : '#00ff88'};">
            <i class="fas ${isError ? 'fa-exclamation-triangle' : 'fa-check-circle'}"></i> ${message}
        </div>`;
        setTimeout(() => msgDiv.innerHTML = '', 5000);
    }
}

// Login Function
async function login(username, password) {
    if (!username || !password) {
        showNotification('Please enter both username and password', true, 'authMsg');
        return;
    }
    
    try {
        showNotification('Logging in...', false, 'authMsg');
        
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            currentUser = data.user;
            localStorage.setItem('userToken', data.token);
            localStorage.setItem('userData', JSON.stringify(currentUser));
            
            const audio = document.getElementById('loginSong');
            if (audio) {
                audio.volume = 0.2;
                audio.play().catch(e => console.log('Audio play failed:', e));
                setTimeout(() => {
                    audio.pause();
                    audio.currentTime = 0;
                }, 5000);
            }
            
            showNotification(data.message, false, 'authMsg');
            showUserDashboard();
            loadUserStats();
            setupSocket();
            startAutoRefresh();
            resetScores();
        } else {
            showNotification(data.error || 'Login failed. Check your credentials.', true, 'authMsg');
        }
    } catch (error) {
        console.error('Login error:', error);
        showNotification('Connection error. Please try again.', true, 'authMsg');
    }
}

// Register Function
async function register(username, email, password) {
    if (!username || !email || !password) {
        showNotification('Please fill all fields', true, 'authMsg');
        return;
    }
    
    if (password.length < 4) {
        showNotification('Password must be at least 4 characters', true, 'authMsg');
        return;
    }
    
    if (!email.includes('@')) {
        showNotification('Please enter a valid email address', true, 'authMsg');
        return;
    }
    
    try {
        showNotification('Creating account...', false, 'authMsg');
        
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ username, email, password })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showNotification('Registration successful! Please login.', false, 'authMsg');
            document.getElementById('loginUsername').value = username;
            document.getElementById('loginPassword').value = password;
            document.getElementById('regEmail').value = '';
            document.getElementById('registerFields').classList.add('hidden');
        } else {
            showNotification(data.error || 'Registration failed. Try another username.', true, 'authMsg');
        }
    } catch (error) {
        console.error('Register error:', error);
        showNotification('Connection error. Please try again.', true, 'authMsg');
    }
}

// Logout Function
async function logout() {
    try {
        const token = localStorage.getItem('userToken');
        if (token) {
            await fetch('/api/logout', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        }
    } catch (error) {
        console.error('Logout error:', error);
    }
    
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
    
    localStorage.removeItem('userToken');
    localStorage.removeItem('userData');
    currentUser = null;
    currentMatchCode = null;
    
    if (authView) authView.classList.remove('hidden');
    if (userDashboard) userDashboard.classList.add('hidden');
    
    const audio = document.getElementById('loginSong');
    if (audio) {
        audio.pause();
        audio.currentTime = 0;
    }
    
    const passwordField = document.getElementById('loginPassword');
    if (passwordField) passwordField.value = '';
    document.getElementById('regEmail').value = '';
    
    showNotification('Logged out successfully', false, 'authMsg');
    resetScores();
}

// Show User Dashboard
function showUserDashboard() {
    if (authView) authView.classList.add('hidden');
    if (userDashboard) userDashboard.classList.remove('hidden');
    
    if (currentUser) {
        const userBadgeSpan = document.getElementById('userBadge');
        const userLevelSpan = document.getElementById('userLevel');
        if (userBadgeSpan) userBadgeSpan.textContent = currentUser.badge || 'Novice';
        if (userLevelSpan) userLevelSpan.textContent = currentUser.level || 0;
    }
    
    const guideClosed = localStorage.getItem(`guide_closed_${currentUser?.id}`);
    const guidePanel = document.getElementById('guidePanel');
    if (guidePanel) {
        if (!guideClosed) {
            guidePanel.classList.remove('hidden');
        } else {
            guidePanel.classList.add('hidden');
        }
    }
}

// Load User Stats
async function loadUserStats() {
    try {
        const token = localStorage.getItem('userToken');
        if (!token) return;
        
        const response = await fetch('/api/user/stats', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const stats = await response.json();
            const userBadgeSpan = document.getElementById('userBadge');
            const userLevelSpan = document.getElementById('userLevel');
            
            if (userBadgeSpan) userBadgeSpan.textContent = stats.badge || 'Novice';
            if (userLevelSpan) userLevelSpan.textContent = stats.level || 0;
            
            if (currentUser) {
                currentUser.badge = stats.badge;
                currentUser.level = stats.level;
            }
        }
    } catch (error) {
        console.error('Stats error:', error);
    }
}

// Play vs Computer
async function playVsComputer(move) {
    const token = localStorage.getItem('userToken');
    if (!token) {
        showNotification('Please login to play', true, 'vsComputerResult');
        return;
    }
    
    const difficulty = document.getElementById('difficultySelect')?.value || 'easy';
    
    try {
        const response = await fetch('/api/game/computer', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ playerMove: move, difficulty })
        });
        
        if (!response.ok) {
            const error = await response.json();
            showNotification(error.error || 'Game error', true, 'vsComputerResult');
            return;
        }
        
        const data = await response.json();
        const resultDiv = document.getElementById('vsComputerResult');
        
        const moveIcons = {
            rock: 'Fist',
            paper: 'Hand',
            scissors: 'Scissors'
        };
        
        let resultText = `<div style="font-size: 1.1rem;">
            <strong>You:</strong> ${moveIcons[data.playerMove]} ${data.playerMove.toUpperCase()} 
            vs 
            <strong>CPU:</strong> ${moveIcons[data.computerMove]} ${data.computerMove.toUpperCase()}
        </div>`;
        
        if (data.result === 'win') {
            resultText += '<div style="color: #00ff88; margin-top: 10px;">VICTORY! +1 point</div>';
            userScore++;
            loadUserStats();
        } else if (data.result === 'lose') {
            resultText += '<div style="color: #ff4b2b; margin-top: 10px;">DEFEAT!</div>';
            computerScore++;
        } else {
            resultText += '<div style="color: #ffaa00; margin-top: 10px;">DRAW!</div>';
        }
        
        if (resultDiv) {
            resultDiv.innerHTML = resultText;
            resultDiv.style.animation = 'glitch 0.3s ease';
            setTimeout(() => { if (resultDiv) resultDiv.style.animation = ''; }, 300);
        }
        
        const userScoreSpan = document.getElementById('userScore');
        const computerScoreSpan = document.getElementById('computerScore');
        if (userScoreSpan) userScoreSpan.textContent = userScore;
        if (computerScoreSpan) computerScoreSpan.textContent = computerScore;
        
        userMoveHistory.push(move);
        if (userMoveHistory.length > 10) userMoveHistory.shift();
        
    } catch (error) {
        console.error('Game error:', error);
        showNotification('Game error. Please try again.', true, 'vsComputerResult');
    }
}

// Reset Scores
function resetScores() {
    userScore = 0;
    computerScore = 0;
    userMoveHistory = [];
    const userScoreSpan = document.getElementById('userScore');
    const computerScoreSpan = document.getElementById('computerScore');
    if (userScoreSpan) userScoreSpan.textContent = '0';
    if (computerScoreSpan) computerScoreSpan.textContent = '0';
    const resultDiv = document.getElementById('vsComputerResult');
    if (resultDiv) resultDiv.innerHTML = '';
}

// Setup Socket.IO for Multiplayer
function setupSocket() {
    if (!socket) return;
    
    socket.off('online-count');
    socket.off('match-created');
    socket.off('match-started');
    socket.off('game-result');
    socket.off('new-sticker');
    socket.off('join-error');
    
    if (currentUser) {
        socket.emit('user-online', {
            userId: currentUser.id,
            username: currentUser.username
        });
    }
    
    socket.on('online-count', (data) => {
        const onlineCountSpan = document.getElementById('onlineCountNav');
        if (onlineCountSpan) onlineCountSpan.textContent = data.count || 0;
    });
    
    socket.on('match-created', (data) => {
        currentMatchCode = data.matchCode;
        const multiStatus = document.getElementById('multiStatus');
        const multiMoves = document.getElementById('multiMoves');
        if (multiStatus) {
            multiStatus.innerHTML = `<div style="color: #00ff88;">Match created! Code: <strong style="font-size: 1.2rem;">${data.matchCode}</strong><br>Share this code with your opponent to join!</div>`;
        }
        if (multiMoves) multiMoves.classList.remove('hidden');
    });
    
    socket.on('match-started', (data) => {
        const multiStatus = document.getElementById('multiStatus');
        if (multiStatus) {
            multiStatus.innerHTML = '<div style="color: #00ff88;">Match started! Make your move!</div>';
        }
        const multiMoves = document.getElementById('multiMoves');
        if (multiMoves) multiMoves.classList.remove('hidden');
    });
    
    socket.on('game-result', (data) => {
        const moveIcons = { rock: 'Fist', paper: 'Hand', scissors: 'Scissors' };
        const multiStatus = document.getElementById('multiStatus');
        
        let resultHtml = `<div>Host: ${moveIcons[data.hostMove]} ${data.hostMove.toUpperCase()} vs Opponent: ${moveIcons[data.opponentMove]} ${data.opponentMove.toUpperCase()}</div>`;
        
        if (data.winner === 'tie') {
            resultHtml += '<div style="color: #ffaa00; margin-top: 10px;">DRAW!</div>';
        } else if (data.winner === currentUser?.id) {
            resultHtml += '<div style="color: #00ff88; margin-top: 10px;">VICTORY!</div>';
            loadUserStats();
        } else {
            resultHtml += '<div style="color: #ff4b2b; margin-top: 10px;">DEFEAT!</div>';
        }
        
        if (multiStatus) multiStatus.innerHTML = resultHtml;
        
        setTimeout(() => {
            currentMatchCode = null;
            const multiMoves = document.getElementById('multiMoves');
            const multiStatusElem = document.getElementById('multiStatus');
            if (multiMoves) multiMoves.classList.add('hidden');
            if (multiStatusElem && !multiStatusElem.innerHTML.includes('Match created')) {
                multiStatusElem.innerHTML = 'No active match';
            }
        }, 4000);
    });
    
    socket.on('new-sticker', (data) => {
        const stickerLog = document.getElementById('stickerLog');
        if (stickerLog) {
            const stickerElement = document.createElement('div');
            stickerElement.innerHTML = `<span style="color: cyan;">${escapeHtml(data.username)}:</span> ${data.sticker}`;
            stickerLog.insertBefore(stickerElement, stickerLog.firstChild);
            if (stickerLog.children.length > 10) {
                stickerLog.removeChild(stickerLog.lastChild);
            }
        }
    });
    
    socket.on('join-error', (data) => {
        const multiStatus = document.getElementById('multiStatus');
        if (multiStatus) {
            multiStatus.innerHTML = `<div style="color: #ff4b2b;">Error: ${data.error}</div>`;
        }
    });
}

// Create multiplayer match
function createMatch() {
    if (!currentUser) {
        showNotification('Please login first', true, 'multiStatus');
        return;
    }
    socket.emit('create-match', {
        userId: currentUser.id,
        username: currentUser.username
    });
}

// Join multiplayer match
function joinMatch() {
    const matchCode = document.getElementById('joinMatchCode')?.value.trim().toUpperCase();
    if (!matchCode) {
        const multiStatus = document.getElementById('multiStatus');
        if (multiStatus) multiStatus.innerHTML = '<div style="color: #ff4b2b;">Please enter a match code</div>';
        return;
    }
    
    if (!currentUser) {
        showNotification('Please login first', true, 'multiStatus');
        return;
    }
    
    socket.emit('join-match', {
        matchCode,
        userId: currentUser.id,
        username: currentUser.username
    });
    currentMatchCode = matchCode;
}

// Make move in multiplayer
function makeMultiMove(move) {
    if (!currentMatchCode) {
        const multiStatus = document.getElementById('multiStatus');
        if (multiStatus) multiStatus.innerHTML = '<div style="color: #ff4b2b;">No active match</div>';
        return;
    }
    
    socket.emit('make-move', {
        matchCode: currentMatchCode,
        userId: currentUser.id,
        move
    });
    
    const multiStatus = document.getElementById('multiStatus');
    if (multiStatus) multiStatus.innerHTML = 'Move sent! Waiting for opponent...';
}

// Send sticker in multiplayer
function sendSticker(sticker) {
    if (!currentMatchCode) {
        alert('No active match to send stickers');
        return;
    }
    
    socket.emit('send-sticker', {
        matchCode: currentMatchCode,
        userId: currentUser.id,
        username: currentUser.username,
        sticker
    });
}

// Auto refresh data
function startAutoRefresh() {
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(() => {
        if (currentUser && userDashboard && !userDashboard.classList.contains('hidden')) {
            loadUserStats();
        }
    }, 30000);
}

// Escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Check for existing session
function checkExistingSession() {
    const savedToken = localStorage.getItem('userToken');
    const savedUser = localStorage.getItem('userData');
    
    if (savedToken && savedUser) {
        currentUser = JSON.parse(savedUser);
        fetch('/api/verify-token', {
            headers: { 'Authorization': `Bearer ${savedToken}` }
        }).then(response => response.json()).then(data => {
            if (data.valid) {
                showUserDashboard();
                loadUserStats();
                setupSocket();
                startAutoRefresh();
                resetScores();
            } else {
                localStorage.removeItem('userToken');
                localStorage.removeItem('userData');
            }
        }).catch(() => {
            console.warn('Could not verify session');
        });
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.onclick = () => {
            const username = document.getElementById('loginUsername').value;
            const password = document.getElementById('loginPassword').value;
            login(username, password);
        };
    }
    
    const showRegisterBtn = document.getElementById('showRegisterBtn');
    if (showRegisterBtn) {
        showRegisterBtn.onclick = () => {
            document.getElementById('registerFields').classList.toggle('hidden');
        };
    }
    
    const confirmRegisterBtn = document.getElementById('confirmRegisterBtn');
    if (confirmRegisterBtn) {
        confirmRegisterBtn.onclick = () => {
            const username = document.getElementById('loginUsername').value;
            const email = document.getElementById('regEmail').value;
            const password = document.getElementById('loginPassword').value;
            register(username, email, password);
        };
    }
    
    const logoutBtn = document.getElementById('logoutBtnUser');
    if (logoutBtn) {
        logoutBtn.onclick = logout;
    }
    
    const closeGuideBtn = document.getElementById('closeGuideBtn');
    if (closeGuideBtn) {
        closeGuideBtn.onclick = () => {
            const guidePanel = document.getElementById('guidePanel');
            if (guidePanel) guidePanel.classList.add('hidden');
            if (currentUser) {
                localStorage.setItem(`guide_closed_${currentUser.id}`, 'true');
            }
        };
    }
    
    const createMatchBtn = document.getElementById('createMatchBtn');
    if (createMatchBtn) {
        createMatchBtn.onclick = createMatch;
    }
    
    const joinMatchBtn = document.getElementById('joinMatchBtn');
    if (joinMatchBtn) {
        joinMatchBtn.onclick = joinMatch;
    }
    
    document.querySelectorAll('[data-move]').forEach(btn => {
        btn.onclick = () => playVsComputer(btn.getAttribute('data-move'));
    });
    
    document.querySelectorAll('[data-mmove]').forEach(btn => {
        btn.onclick = () => makeMultiMove(btn.getAttribute('data-mmove'));
    });
    
    document.querySelectorAll('[data-sticker]').forEach(sticker => {
        sticker.onclick = () => sendSticker(sticker.getAttribute('data-sticker'));
    });
    
    const loginPasswordField = document.getElementById('loginPassword');
    if (loginPasswordField) {
        loginPasswordField.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const username = document.getElementById('loginUsername').value;
                const password = document.getElementById('loginPassword').value;
                login(username, password);
            }
        });
    }
    
    checkExistingSession();
});
