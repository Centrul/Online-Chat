const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Replace with your frontend origin in production
    methods: ["GET", "POST"],
  },
});

app.use(cors());

// Open SQLite DB (adjust path accordingly)
const db = new sqlite3.Database('../System/Database/database.db', (err) => {
  if (err) {
    console.error('Failed to open DB:', err.message);
  } else {
    console.log('Connected to SQLite database.');
  }
});

// Maps for user tracking
const connectedUsers = new Map(); // socket.id -> { username, profile_image }
const userSockets = new Map();    // username -> socket.id

// Get user info by username
function getUserInfo(username) {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT * FROM accounts WHERE username = ?",
      [username],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
}

// Get all users from DB (for user list)
function getAllUsers() {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT * FROM accounts",
      [],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
}

function getMessageHistory(user1, user2) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT from_user, to_user, message, timestamp, seen
       FROM messages
       WHERE (from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?)
       ORDER BY timestamp ASC`,
      [user1, user2, user2, user1],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
}


// Store new message in DB
function saveMessage(fromUser, toUser, message) {
  return new Promise((resolve, reject) => {
    const timestamp = Date.now();
    db.run(
      `INSERT INTO messages (from_user, to_user, message, timestamp) VALUES (?, ?, ?, ?)`,
      [fromUser, toUser, message, timestamp],
      function(err) {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}


// Broadcast list of connected users (optional)
function broadcastUserList() {
  const users = Array.from(connectedUsers.values());
  io.emit('updateOnlineUsers', users);
}

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // User joins with username
  socket.on('join', async (username) => {
    try {
      if (connectedUsers.has(socket.id)) {
        console.log(`Socket ${socket.id} already joined`);
        return;
      }

      // Verify user exists
      const userInfo = await getUserInfo(username);
      if (!userInfo) {
        socket.emit('errorMessage', 'User not found.');
        socket.disconnect(true);
        return;
      }

      connectedUsers.set(socket.id, userInfo);
      userSockets.set(username, socket.id);

      console.log(`${username} joined`);

      // Send full user list (all users in DB)
      const allUsers = await getAllUsers();
      socket.emit('allUsers', allUsers);

      // Notify all clients about online users
      broadcastUserList();

    } catch (error) {
      console.error('DB error:', error);
      socket.emit('errorMessage', 'Database error.');
      socket.disconnect(true);
    }
  });

socket.on('messageSeen', async ({ withUser }) => {
  const fromUser = connectedUsers.get(socket.id);
  if (!fromUser) return;

  const currentUsername = fromUser.username;

  db.run(
    `UPDATE messages SET seen = 1
     WHERE from_user = ? AND to_user = ? AND seen = 0`,
    [withUser, currentUsername],
    function(err) {
      if (err) {
        console.error('Failed to update messages as seen:', err);
      } else {
        const senderSocketId = userSockets.get(withUser);
        if (senderSocketId) {
          io.to(senderSocketId).emit('messageSeen', { from: currentUsername });
        }
      }
    }
  );
});


  // Client requests message history with another user
  socket.on('getMessageHistory', async (otherUsername) => {
    try {
      const fromUser = connectedUsers.get(socket.id);
      if (!fromUser) return;

      const history = await getMessageHistory(fromUser.username, otherUsername);
      socket.emit('messageHistory', { withUser: otherUsername, history });
    } catch (error) {
      console.error('Failed to get message history:', error);
      socket.emit('errorMessage', 'Failed to load message history.');
    }
  });

  // Private message sent
  socket.on('privateMessage', async ({ to, message }) => {
    const fromUser = connectedUsers.get(socket.id);
    if (!fromUser) return;

    const targetSocketId = userSockets.get(to);

    try {
      // Save to DB
      await saveMessage(fromUser.username, to, message);
    } catch (error) {
      console.error('Failed to save message:', error);
    }

    if (targetSocketId) {
      io.to(targetSocketId).emit('privateMessage', {
        from: fromUser.username,
        fromProfileImage: fromUser.profile_image,
        message
      });
    }
  });

  socket.on('disconnect', () => {
    const user = connectedUsers.get(socket.id);
    if (user) {
      connectedUsers.delete(socket.id);
      userSockets.delete(user.username);
      broadcastUserList();
      console.log(`User disconnected: ${user.username}`);
    } else {
      console.log(`Unknown socket disconnected: ${socket.id}`);
    }
  });
});

app.get('/', (req, res) => {
  res.send('Socket.IO chat server running.');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Socket.IO server running on http://0.0.0.0:${PORT}`);
});
