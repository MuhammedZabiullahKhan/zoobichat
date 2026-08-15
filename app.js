// ===== CONFIGURATION =====
// Use full backend URL (frontend and backend are on different Render services)
const API_URL = 'https://zoobichat.onrender.com/api';

// ===== STATE =====
let currentUser = null;
let activeChatPartner = null;
let messages = [];

// ===== DOM REFS =====
const signinScreen = document.getElementById('signinScreen');
const chatScreen = document.getElementById('chatScreen');
const usernameInput = document.getElementById('usernameInput');
const signinBtn = document.getElementById('signinBtn');
const signinError = document.getElementById('signinError');
const currentUsername = document.getElementById('currentUsername');
const logoutBtn = document.getElementById('logoutBtn');
const findUserInput = document.getElementById('findUserInput');
const findUserBtn = document.getElementById('findUserBtn');
const searchError = document.getElementById('searchError');
const messagesContainer = document.getElementById('messagesContainer');
const chatPartnerInfo = document.getElementById('chatPartnerInfo');
const chatPartnerName = document.getElementById('chatPartnerName');
const closeChatBtn = document.getElementById('closeChatBtn');
const messageInput = document.getElementById('messageInput');
const sendMsgBtn = document.getElementById('sendMsgBtn');
const charCount = document.getElementById('charCount');

// ===== HELPERS =====
function showError(element, message) {
  element.textContent = message;
  if (message) {
    setTimeout(() => { element.textContent = ''; }, 5000);
  }
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ===== API FUNCTIONS =====
async function apiCall(endpoint, options = {}) {
  console.log(`📡 Calling: ${API_URL}${endpoint}`);
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  
  // Handle 401 gracefully
  if (response.status === 401) {
    console.log('🔐 Authentication required');
    return null;
  }
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'API call failed');
  }
  
  return response.json();
}

// ===== AUTH FUNCTIONS =====
async function signin(username) {
  try {
    const data = await apiCall('/auth/signin', {
      method: 'POST',
      body: JSON.stringify({ username })
    });
    
    if (!data) {
      showError(signinError, 'Sign in failed. Please try again.');
      return;
    }
    
    currentUser = data.user;
    showChatUI();
    showSystemMessage(`👋 Welcome ${currentUser.username}! Find someone to chat with.`);
    console.log('✅ Signed in successfully:', currentUser.username);
  } catch (error) {
    showError(signinError, error.message);
  }
}

async function checkSession() {
  try {
    const data = await apiCall('/auth/session');
    if (data && data.authenticated) {
      currentUser = data.user;
      showChatUI();
      showSystemMessage(`👋 Welcome back ${currentUser.username}!`);
      console.log('✅ Session restored:', currentUser.username);
      return true;
    }
    console.log('ℹ️ No active session');
    return false;
  } catch (error) {
    console.log('ℹ️ No active session');
    return false;
  }
}

async function logout() {
  try {
    await apiCall('/auth/logout', { method: 'POST' });
    currentUser = null;
    activeChatPartner = null;
    messages = [];
    showSigninUI();
    console.log('👋 Logged out');
  } catch (error) {
    console.error('Logout error:', error);
  }
}

// ===== CHAT FUNCTIONS =====
async function loadMessages(partner) {
  if (!currentUser) {
    showSystemMessage('⚠️ Please sign in first');
    return;
  }
  
  try {
    const data = await apiCall(`/messages/${encodeURIComponent(partner)}`);
    if (data && data.messages) {
      messages = data.messages || [];
      renderMessages();
    } else {
      messages = [];
      renderMessages();
    }
  } catch (error) {
    console.error('Load messages error:', error);
    showSystemMessage('⚠️ Could not load messages');
  }
}

async function findAndChat(username) {
  if (!currentUser) {
    showError(searchError, 'Please sign in first');
    return;
  }
  
  const trimmed = username.trim();
  if (!trimmed) {
    showError(searchError, 'Please enter a username');
    return;
  }
  
  if (trimmed === currentUser.username) {
    showError(searchError, 'That\'s you! Find someone else');
    return;
  }
  
  try {
    const data = await apiCall(`/users/${encodeURIComponent(trimmed)}/exists`);
    if (!data) {
      showError(searchError, 'Please sign in again');
      return;
    }
    
    if (!data.exists) {
      showError(searchError, `User "${trimmed}" not found`);
      return;
    }
    
    activeChatPartner = trimmed;
    showSearchError('');
    findUserInput.value = '';
    
    chatPartnerName.textContent = trimmed;
    chatPartnerInfo.classList.remove('hidden');
    
    messageInput.disabled = false;
    sendMsgBtn.disabled = false;
    messageInput.focus();
    
    await loadMessages(trimmed);
    showSystemMessage(`💬 Now chatting with ${trimmed}`);
  } catch (error) {
    showError(searchError, error.message);
  }
}

async function sendMessage(text) {
  if (!currentUser) {
    showSystemMessage('⚠️ Please sign in first');
    return;
  }
  
  if (!activeChatPartner) {
    showSystemMessage('⚠️ Please find a user to chat with');
    return;
  }
  
  if (!text.trim()) return;
  
  try {
    const data = await apiCall('/messages', {
      method: 'POST',
      body: JSON.stringify({
        to: activeChatPartner,
        text: text.trim()
      })
    });
    
    if (!data) {
      showSystemMessage('⚠️ Please sign in again');
      return;
    }
    
    messages.push(data.message);
    renderMessages();
    messageInput.value = '';
    updateCharCount();
  } catch (error) {
    showSystemMessage('⚠️ Failed to send message');
    console.error('Send error:', error);
  }
}

async function deleteMessage(messageId) {
  if (!currentUser) {
    showSystemMessage('⚠️ Please sign in first');
    return;
  }
  
  try {
    const data = await apiCall(`/messages/${messageId}`, { method: 'DELETE' });
    if (!data) {
      showSystemMessage('⚠️ Please sign in again');
      return;
    }
    
    messages = messages.filter(m => m.id !== messageId);
    renderMessages();
  } catch (error) {
    showSystemMessage('⚠️ Failed to delete message');
    console.error('Delete error:', error);
  }
}

function closeChat() {
  activeChatPartner = null;
  chatPartnerInfo.classList.add('hidden');
  messageInput.disabled = true;
  sendMsgBtn.disabled = true;
  messages = [];
  renderMessages();
  showSystemMessage('💫 Select a user to start chatting');
}

// ===== RENDER FUNCTIONS =====
function renderMessages() {
  if (!messagesContainer) return;
  
  if (!activeChatPartner || !currentUser) {
    messagesContainer.innerHTML = `
      <div class="system-message">
        <i class="fas fa-info-circle"></i>
        ${!currentUser ? 'Please sign in to start chatting' : 'Find a user to start chatting'}
      </div>
    `;
    return;
  }
  
  if (messages.length === 0) {
    messagesContainer.innerHTML = `
      <div class="system-message">
        <i class="fas fa-comment"></i>
        No messages yet. Say hello!
      </div>
    `;
    return;
  }
  
  let html = '';
  messages.forEach(msg => {
    const isOwn = msg.from === currentUser.username;
    html += `
      <div class="message ${isOwn ? 'own' : 'other'}">
        ${!isOwn ? `<span class="sender-name">${msg.from}</span>` : ''}
        <div class="message-text">${escapeHtml(msg.text)}</div>
        <div class="message-meta">
          <span>${formatTime(msg.timestamp)}</span>
          ${isOwn ? `
            <button class="delete-btn" data-msgid="${msg.id}">
              <i class="fas fa-trash-alt"></i>
            </button>
          ` : ''}
        </div>
      </div>
    `;
  });
  
  messagesContainer.innerHTML = html;
  scrollToBottom();
  
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      deleteMessage(this.dataset.msgid);
    });
  });
}

function showSystemMessage(text) {
  messagesContainer.innerHTML = `
    <div class="system-message">
      <i class="fas fa-info-circle"></i>
      ${text}
    </div>
  `;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function updateCharCount() {
  const count = messageInput.value.length;
  charCount.textContent = `${count}/300`;
}

// ===== UI FUNCTIONS =====
function showSigninUI() {
  signinScreen.classList.remove('hidden');
  chatScreen.classList.add('hidden');
}

function showChatUI() {
  signinScreen.classList.add('hidden');
  chatScreen.classList.remove('hidden');
  currentUsername.textContent = currentUser.username;
}

function showSearchError(message) {
  showError(searchError, message);
}

// ===== EVENT LISTENERS =====
signinBtn.addEventListener('click', () => signin(usernameInput.value));
usernameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') signin(usernameInput.value);
});

logoutBtn.addEventListener('click', logout);

findUserBtn.addEventListener('click', () => findAndChat(findUserInput.value));
findUserInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') findAndChat(findUserInput.value);
});

closeChatBtn.addEventListener('click', closeChat);

sendMsgBtn.addEventListener('click', () => sendMessage(messageInput.value));
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage(messageInput.value);
  }
});

messageInput.addEventListener('input', updateCharCount);

// ===== INIT =====
async function init() {
  console.log('🚀 ZoobiChat starting...');
  console.log(`📡 API URL: ${API_URL}`);
  const hasSession = await checkSession();
  if (!hasSession) {
    showSigninUI();
  }
}

// Start the app
init();
