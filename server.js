const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3001;

// Serve static files from root directory
app.use(express.static(__dirname));

// Data directory
const DATA_DIR = path.join(__dirname, 'data');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Ensure data directory exists
fs.ensureDirSync(DATA_DIR);

// Initialize data files
if (!fs.existsSync(MESSAGES_FILE)) {
  fs.writeJsonSync(MESSAGES_FILE, []);
}
if (!fs.existsSync(USERS_FILE)) {
  fs.writeJsonSync(USERS_FILE, {});
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ===== CORS - Allow GitHub Pages =====
const allowedOrigins = [
  'https://muhammedzabiullahkhan.github.io',
  'https://zoobichat.onrender.com',
  'http://localhost:3000',
  'http://localhost:3001'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
}));

// Additional headers
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// ===== CRITICAL: Session with cross-domain cookie support =====
app.use(session({
  secret: process.env.SESSION_SECRET || 'zoobichat-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Must be false for cross-domain
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'none', // CRITICAL: Allows cross-site requests
    domain: '.onrender.com' // Allows the cookie on Render subdomains
  }
}));

// ========== DATA HELPERS ==========
const getMessages = () => fs.readJsonSync(MESSAGES_FILE);
const saveMessages = (data) => fs.writeJsonSync(MESSAGES_FILE, data);
const getUsers = () => fs.readJsonSync(USERS_FILE);
const saveUsers = (data) => fs.writeJsonSync(USERS_FILE, data);

// ========== AUTH MIDDLEWARE ==========
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized - Please sign in' });
  }
  next();
};

// ========== ROUTES ==========

// 1. User Registration/Login
app.post('/api/auth/signin', (req, res) => {
  const { username } = req.body;
  
  if (!username || username.trim().length === 0) {
    return res.status(400).json({ error: 'Username is required' });
  }
  
  const trimmedUsername = username.trim();
  if (trimmedUsername.length > 20) {
    return res.status(400).json({ error: 'Username too long (max 20 characters)' });
  }
  
  if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
    return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores' });
  }
  
  const users = getUsers();
  
  if (users[trimmedUsername]) {
    return res.status(409).json({ error: 'Username already taken' });
  }
  
  const userId = uuidv4();
  users[trimmedUsername] = {
    id: userId,
    username: trimmedUsername,
    createdAt: new Date().toISOString()
  };
  saveUsers(users);
  
  req.session.userId = userId;
  req.session.username = trimmedUsername;
  
  req.session.save((err) => {
    if (err) {
      console.error('Session save error:', err);
      return res.status(500).json({ error: 'Failed to create session' });
    }
    
    res.json({
      success: true,
      user: {
        id: userId,
        username: trimmedUsername
      }
    });
  });
});

// 2. Check session
app.get('/api/auth/session', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'No active session' });
  }
  
  const users = getUsers();
  const user = Object.values(users).find(u => u.id === req.session.userId);
  
  if (!user) {
    req.session.destroy();
    return res.status(401).json({ error: 'User not found' });
  }
  
  res.json({
    authenticated: true,
    user: {
      id: user.id,
      username: user.username
    }
  });
});

// 3. Logout
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

// 4. Check if user exists
app.get('/api/users/:username/exists', (req, res) => {
  const { username } = req.params;
  const users = getUsers();
  const exists = !!users[username];
  res.json({ exists });
});

// 5. Get all users
app.get('/api/users', requireAuth, (req, res) => {
  const users = getUsers();
  const currentUsername = req.session.username;
  const userList = Object.keys(users)
    .filter(username => username !== currentUsername)
    .map(username => ({
      username,
      id: users[username].id
    }));
  res.json({ users: userList });
});

// 6. Get messages between two users
app.get('/api/messages/:partner', requireAuth, (req, res) => {
  const currentUser = req.session.username;
  const partner = req.params.partner;
  
  const allMessages = getMessages();
  const filtered = allMessages.filter(msg => 
    (msg.from === currentUser && msg.to === partner) ||
    (msg.from === partner && msg.to === currentUser)
  );
  
  res.json({ messages: filtered });
});

// 7. Send message
app.post('/api/messages', requireAuth, (req, res) => {
  const { to, text } = req.body;
  const from = req.session.username;
  
  if (!to || !text || text.trim().length === 0) {
    return res.status(400).json({ error: 'Invalid message' });
  }
  
  const users = getUsers();
  if (!users[to]) {
    return res.status(404).json({ error: 'Recipient not found' });
  }
  
  const newMessage = {
    id: uuidv4(),
    from,
    to,
    text: text.trim(),
    timestamp: new Date().toISOString(),
    read: false
  };
  
  const messages = getMessages();
  messages.push(newMessage);
  saveMessages(messages);
  
  res.json({ message: newMessage });
});

// 8. Delete message
app.delete('/api/messages/:messageId', requireAuth, (req, res) => {
  const { messageId } = req.params;
  const currentUser = req.session.username;
  
  const messages = getMessages();
  const index = messages.findIndex(m => m.id === messageId);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Message not found' });
  }
  
  if (messages[index].from !== currentUser) {
    return res.status(403).json({ error: 'You can only delete your own messages' });
  }
  
  messages.splice(index, 1);
  saveMessages(messages);
  
  res.json({ success: true });
});

// 9. Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    users: Object.keys(getUsers()).length,
    messages: getMessages().length
  });
});

// 10. Serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 ZoobiChat Server running on port ${PORT}`);
  console.log(`📁 Data directory: ${DATA_DIR}`);
  console.log(`👥 Users: ${Object.keys(getUsers()).length}`);
  console.log(`💬 Messages: ${getMessages().length}`);
  console.log(`🌐 CORS enabled for: ${allowedOrigins.join(', ')}`);
});
