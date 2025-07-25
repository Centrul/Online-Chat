let socket;
let selectedUser = null;
let allUsers = [];
let unreadMessages = {};
let lastSender = null;

const backButton = document.getElementById('backButton');
const usersContainer = document.getElementById('usersContainer');
const chatContainer = document.getElementById('chatContainer');

function connect() {
	if (!currentUser) {
		alert("Te rugăm să te conectezi prin PHP session sau implementare login.");
		return;
	}

	const SERVER_IP = "192.168.11.73";
	const SERVER_PORT = 3000;

	socket = io(`http://${SERVER_IP}:${SERVER_PORT}`);

	socket.emit('join', currentUser);

	socket.on('allUsers', (users) => {
		allUsers = users;
		const userList = document.getElementById('userList');
		userList.innerHTML = '';

		users.forEach(user => {
			if (user.username !== currentUser) {
				const userItem = document.createElement('div');
				userItem.classList.add('user-item');
				userItem.dataset.username = user.username; // store username for reference

				const img = document.createElement('img');
				img.src = user.profile_image || 'https://via.placeholder.com/40';
				img.alt = user.fullname || user.username;
				img.style.width = '40px';
				img.style.height = '40px';
				img.style.borderRadius = '50%';
				img.style.objectFit = 'cover';
				img.classList.add('me-2');

				const nameSpan = document.createElement('span');
				nameSpan.textContent = user.fullname || user.username;

				// Create unread badge span but hidden initially
				const badge = document.createElement('span');
				badge.classList.add('badge', 'bg-danger', 'ms-2');
				badge.style.display = 'none';
				badge.style.fontSize = '0.75rem';
				badge.style.minWidth = '18px';
				badge.style.textAlign = 'center';
				badge.style.borderRadius = '12px';
				badge.style.padding = '2px 6px';
				badge.textContent = '0';

				userItem.appendChild(img);
				userItem.appendChild(nameSpan);
				userItem.appendChild(badge);

				userItem.onclick = () => {
					selectUser(user.username);
					// Highlight selected user
					document.querySelectorAll('#userList .user-item').forEach(el => el.style.backgroundColor = 'transparent');
					userItem.style.backgroundColor = '#d0e0ff';

					// Clear unread count for selected user and update badge
					unreadMessages[user.username] = 0;
					badge.style.display = 'none';
				};

				userList.appendChild(userItem);

				// Initialize unread count for user
				unreadMessages[user.username] = 0;
			}
		});

		usersContainer.style.display = 'block';
		chatContainer.style.display = 'none';
		backButton.style.display = 'none';
	});

	socket.on('messageSeen', ({
		from
	}) => {
		// Only update if the seen message is from the selected user
		if (from === selectedUser) {
			// Update all stored message icons to double checkmark
			for (const [msgId, icon] of messageIdToIcon.entries()) {
				icon.classList.remove('fa-check');
				icon.classList.add('fa-check-double');
				icon.style.color = '#4fc3f7'; // light blue
			}
		}
	});




	socket.on('privateMessage', ({
		from,
		fromProfileImage,
		message
	}) => {
		if (from === selectedUser) {
			addMessage(from, message, false);

			// Notify server we have seen this message immediately
			socket.emit('messageSeen', {
				withUser: from
			});
		} else {
			// Increment unread count for sender
			if (!unreadMessages[from]) unreadMessages[from] = 0;
			unreadMessages[from]++;

			// Find the user item in list and show badge
			const userItem = document.querySelector(`#userList .user-item[data-username="${from}"]`);
			if (userItem) {
				const badge = userItem.querySelector('span.badge');
				badge.textContent = unreadMessages[from];
				badge.style.display = 'inline-block';
			}
		}
	});


	socket.on('messageHistory', ({
		withUser,
		history
	}) => {
		if (withUser !== selectedUser) return;

		clearMessages();

		history.forEach(msg => {
			const self = (msg.from_user === currentUser);
			addMessage(msg.from_user, msg.message, self, msg.seen);
		});
	});

}

function selectUser(username) {
	selectedUser = username;

	const user = allUsers.find(u => u.username === username);

	if (user) {
		document.getElementById('chatUserName').textContent = user.fullname || user.username;
		document.getElementById('chatUserImage').src = user.profile_image || 'https://via.placeholder.com/40';
		document.getElementById('chatUserInfo').style.display = 'flex';

		document.getElementById('myUserName').style.display = 'none';
	}

	usersContainer.style.display = 'none';
	chatContainer.style.display = 'flex';
	backButton.style.display = 'inline-block';

	clearMessages();

	// Clear unread count and badge for selected user on selection
	unreadMessages[username] = 0;
	const userItem = document.querySelector(`#userList .user-item[data-username="${username}"]`);
	if (userItem) {
		const badge = userItem.querySelector('span.badge');
		badge.style.display = 'none';
	}

	socket.emit('getMessageHistory', username);
	socket.emit('messageSeen', {
		withUser: username
	});

}

backButton.onclick = () => {
	selectedUser = null;
	chatContainer.style.display = 'none';
	usersContainer.style.display = 'block';
	backButton.style.display = 'none';
	clearMessages();
};

function send() {
	if (!selectedUser) {
		alert('Selectează un utilizator pentru chat.');
		return;
	}

	const message = document.getElementById('msgInput').value.trim();
	if (!message) {
		alert('Scrie un mesaj.');
		return;
	}

	// Add message locally with self = true
	addMessage(currentUser, message, true);

	socket.emit('privateMessage', {
		to: selectedUser,
		message
	});

	document.getElementById('msgInput').value = '';

	// You might not want to fetch history every time you send a message,
	// just rely on addMessage locally and server pushes for new messages
	// socket.emit('getMessageHistory', selectedUser);
}

let messageCounter = 0; // Incremental ID for messages
const messageIdToIcon = new Map();
let lastSentMessageElement = null;
let lastSentMessageSpan = null;
const sentMessageSpans = new Set();


// Escape HTML special chars to prevent XSS
function escapeHtml(text) {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

// Convert URLs to clickable links
function linkify(text) {
	const escapedText = escapeHtml(text);

	// Regex to match URLs starting with http or https
	const urlRegex = /(\bhttps?:\/\/[^\s]+)/gi;

	return escapedText.replace(urlRegex, url =>
		`<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
	);
}

function addMessage(from, message, self, seen = false) {
	const box = document.getElementById('messages');
	const messageContainer = document.createElement('div');
	messageContainer.style.display = 'flex';
	messageContainer.style.alignItems = 'flex-end';
	messageContainer.style.marginBottom = '4px';

	const showProfileImage = lastSender !== from;

	if (!self) {
		if (showProfileImage) {
			const user = allUsers.find(u => u.username === from);
			const img = document.createElement('img');
			img.src = user?.profile_image || 'https://via.placeholder.com/40';
			img.alt = from;
			img.style.width = '32px';
			img.style.height = '32px';
			img.style.borderRadius = '50%';
			img.style.objectFit = 'cover';
			img.style.marginRight = '8px';
			messageContainer.appendChild(img);
		} else {
			messageContainer.style.paddingLeft = '40px';
		}
	} else {
		messageContainer.style.justifyContent = 'flex-end';
	}

	const msgDiv = document.createElement('div');
	msgDiv.classList.add('chat-message');
	msgDiv.classList.add(self ? 'self' : 'other');

	// Use innerHTML to render HTML links correctly
	msgDiv.innerHTML = linkify(message);

	if (self) {
		const msgId = `msg-${messageCounter++}`;

		const seenIcon = document.createElement('i');
		seenIcon.classList.add('fa-solid');

		if (seen) {
			seenIcon.classList.add('fa-check-double');
			seenIcon.style.color = '#4fc3f7';
		} else {
			seenIcon.classList.add('fa-check');
			seenIcon.style.color = '#555';
		}

		seenIcon.style.fontSize = '0.8rem';
		seenIcon.style.marginLeft = '6px';

		msgDiv.appendChild(seenIcon);
		msgDiv.dataset.msgId = msgId;

		messageIdToIcon.set(msgId, seenIcon);

		lastSentMessageSpan = seenIcon;
		lastSentMessageElement = msgDiv;
	}

	messageContainer.appendChild(msgDiv);
	box.appendChild(messageContainer);
	box.scrollTop = box.scrollHeight;

	lastSender = from;
}



function clearMessages() {
	document.getElementById('messages').innerHTML = '';
	sentMessageSpans.clear();
	lastSentMessageSpan = null;
	lastSender = null;
	messageIdToIcon.clear();
}
document.addEventListener('DOMContentLoaded', connect);