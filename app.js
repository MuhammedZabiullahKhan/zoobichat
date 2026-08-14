// ===== CONFIGURATION =====
// Change this to your Render backend URL when deploying
const API_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3001/api' 
  : 'https://your-backend-url.onrender.com/api';

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
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  
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
    
    currentUser = data.user;
    showChatUI();
    await loadUserData();
    showSystemMessage(`👋 Welcome ${currentUser.username}! Find someone to chat with.`);
  } catch (error) {
    showError(signinError, error.message);
  }
}

async function checkSession() {
  try {
    const data = await apiCall('/auth/session');
    if (data.authenticated) {
      currentUser = data.user;
      showChatUI();
      await loadUserData();
      showSystemMessage(`👋 Welcome back ${currentUser.username}!`);
      return true;
    }
    return false;
  } catch (error) {
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
  } catch (error) {
    console.error('Logout error:', error);
  }
}

// ===== CHAT FUNCTIONS =====
async function loadUserData() {
  // Load any existing chat data if needed
  if (activeChatPartner) {
    await loadMessages(activeChatPartner);
  }
}

async function loadMessages(partner) {
  try {
    const data = await apiCall(`/messages/${encodeURIComponent(partner)}`);
    messages = data.messages || [];
    renderMessages();
  } catch (error) {
    console.error('Load messages error:', error);
    showSystemMessage('⚠️ Could not load messages');
  }
}

async function findAndChat(username) {
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
    // Check if user exists
    const data = await apiCall(`/users/${encodeURIComponent(trimmed)}/exists`);
    if (!data.exists) {
      showError(searchError, `User "${trimmed}" not found`);
      return;
    }
    
    activeChatPartner = trimmed;
    showSearchError('');
    findUserInput.value = '';
    
    // Show partner info
    chatPartnerName.textContent = trimmed;
    chatPartnerInfo.classList.remove('hidden');
    
    // Enable messaging
    messageInput.disabled = false;
    sendMsgBtn.disabled = false;
    messageInput.focus();
    
    // Load messages
    await loadMessages(trimmed);
    showSystemMessage(`💬 Now chatting with ${trimmed}`);
  } catch (error) {
    showError(searchError, error.message);
  }
}

async function sendMessage(text) {
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
  try {
    await apiCall(`/messages/${messageId}`, { method: 'DELETE' });
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
  
  if (!activeChatPartner) {
    messagesContainer.innerHTML = `
      <div class="system-message">
        <i class="fas fa-info-circle"></i>
        Find a user to start chatting
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
  
  // Attach delete handlers
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
// Sign in
signinBtn.addEventListener('click', () => {
  signin(usernameInput.value);
});

usernameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') signin(usernameInput.value);
});

// Logout
logoutBtn.addEventListener('click', logout);

// Find user
findUserBtn.addEventListener('click', () => {
  findAndChat(findUserInput.value);
});

findUserInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') findAndChat(findUserInput.value);
});

// Close chat
closeChatBtn.addEventListener('click', closeChat);

// Send message
sendMsgBtn.addEventListener('click', () => {
  sendMessage(messageInput.value);
});

messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage(messageInput.value);
  }
});

// Character counter
messageInput.addEventListener('input', updateCharCount);

// ===== INIT =====
async function init() {
  const hasSession = await checkSession();
  if (!hasSession) {
    showSigninUI();
  }
}

// Start the app
init();
