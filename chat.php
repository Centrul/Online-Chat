<?php
	$username = isset($_SESSION['username']) ? $_SESSION['username'] : '';
	?>
<script src="https://cdn.socket.io/4.5.4/socket.io.min.js"></script>
<link rel="stylesheet" href="chat/styles.css">
<div class="chat-container shadow-sm">
	<div id="usersContainer" style="display: block;">
		<label class="form-label fw-semibold">Utilizatori online:</label>
		<div id="userList"></div>
	</div>
	<div id="chatContainer" style="display: none; flex-grow: 1;">
		<div class="chat-header d-flex align-items-center">
			<button id="backButton" title="Înapoi">←</button>
			<div id="chatUserInfo" class="d-flex align-items-center ms-auto" style="display:none; gap:10px;">
				<img id="chatUserImage" src="" alt="" style="width:40px; height:40px; border-radius:50%; object-fit:cover;" />
				<strong id="chatUserName"></strong>
			</div>
			<?php if ($username): ?>
			<div id="myUserName" style="margin-left:auto;">&bull; <strong><?= ucfirst(htmlspecialchars($username)) ?></strong></div>
			<?php endif; ?>
		</div>
		<div id="messages" class="chat-body flex-grow-1"></div>
		<div class="chat-footer">
			<input id="msgInput" type="text" class="form-control" placeholder="Scrie un mesaj..." autocomplete="off" />
			<button class="btn btn-primary" onclick="send()">Trimite</button>
		</div>
	</div>
</div>
<script>
	let currentUser = "<?= $username ? htmlspecialchars($username) : '' ?>";
</script>
<script src="<?= $url; ?>chat/java.js"></script>