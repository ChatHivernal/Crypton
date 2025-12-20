let currentRoom = null;
let currentRoomKey = null;
let messageInterval = null;
let pendingRoomId = null;
let canWrite = true;
let currentRoomPassword = '';
let currentUserId = null; // Ajout pour stocker l'ID utilisateur actuel

// Créer l'élément audio pour la notification
const notificationSound = new Audio("https://uploads.nyapi.fr/uploads/71.mp3");
// Son de notification simple (bip court)

// Fonction pour scroller en bas du chat
function scrollToBottom() {
    const messagesContainer = document.querySelector('.messages-container');
    if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

// Fonction pour jouer le son de notification
function playNotificationSound() {
    try {
        notificationSound.currentTime = 0;
        notificationSound.play().catch(e => console.log('Audio play failed:', e));
    } catch (error) {
        console.log('Notification sound error:', error);
    }
}

// Gestion des modals
function showUsernameModal() {
    document.getElementById('username-modal').style.display = 'flex';
}

function hideUsernameModal() {
    document.getElementById('username-modal').style.display = 'none';
}

function showCreateRoomModal() {
    document.getElementById('create-room-modal').style.display = 'flex';
    document.getElementById('room-name').value = '';
    document.getElementById('room-password').value = '';
    document.getElementById('room-type-public').checked = true;
    updateRoomType();
}

function hideCreateRoomModal() {
    document.getElementById('create-room-modal').style.display = 'none';
}

function showJoinRoomModal() {
    document.getElementById('join-room-modal').style.display = 'flex';
    document.getElementById('room-id-input').value = '';
}

function hideJoinRoomModal() {
    document.getElementById('join-room-modal').style.display = 'none';
}

function showPrivateRoomModal(roomId, roomName) {
    pendingRoomId = roomId;
    document.getElementById('private-room-name').textContent = roomName;
    document.getElementById('room-password-input').value = '';
    document.getElementById('password-error').style.display = 'none';
    document.getElementById('private-room-modal').style.display = 'flex';
}

function hidePrivateRoomModal() {
    document.getElementById('private-room-modal').style.display = 'none';
    pendingRoomId = null;
}

function showWritePermissionModal(roomId, roomName) {
    pendingRoomId = roomId;
    document.getElementById('write-room-name').textContent = roomName;
    document.getElementById('write-password-input').value = '';
    document.getElementById('write-password-error').style.display = 'none';
    document.getElementById('write-permission-modal').style.display = 'flex';
}

function hideWritePermissionModal() {
    document.getElementById('write-permission-modal').style.display = 'none';
    pendingRoomId = null;
}

// Gestion du type de salon
function updateRoomType() {
    const roomType = document.querySelector('input[name="room-type"]:checked').value;
    const isPrivate = roomType === 'private';
    const isAnnouncement = roomType === 'announcement';
    
    document.getElementById('password-field').style.display = (isPrivate || isAnnouncement) ? 'block' : 'none';
    
    const passwordHint = document.getElementById('password-hint');
    if (isAnnouncement) {
        passwordHint.textContent = 'Mot de passe requis pour écrire (lecture libre)';
    } else if (isPrivate) {
        passwordHint.textContent = 'Mot de passe requis pour accéder au salon';
    }
    
    document.querySelectorAll('.room-type-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.querySelector(`#room-type-${roomType}`).closest('.room-type-btn').classList.add('active');
}

// Fonction pour récupérer l'utilisateur actuel
async function getCurrentUser() {
    try {
        const response = await fetch('/get_current_user');
        const data = await response.json();
        
        if (data.user_id) {
            currentUserId = data.user_id;
            console.log('User ID récupéré:', currentUserId);
        } else {
            console.log('Aucun user ID trouvé dans la session');
        }
    } catch (error) {
        console.log('Erreur lors de la récupération de l\'utilisateur:', error);
    }
}

// Fonctions principales
async function updateUsername() {
    const newUsername = document.getElementById('new-username').value;
    
    if (!newUsername) {
        alert('Veuillez entrer un nom d\'utilisateur');
        return;
    }
    
    try {
        const response = await fetch('/update_username', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username: newUsername })
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            document.getElementById('current-username').textContent = newUsername;
            hideUsernameModal();
            showNotification('Nom d\'utilisateur mis à jour!', 'success');
        } else {
            alert('Erreur lors du changement de nom');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Erreur de connexion');
    }
}

async function createRoom() {
    const roomName = document.getElementById('room-name').value || 'Nouvelle Salle';
    const roomType = document.querySelector('input[name="room-type"]:checked').value;
    const isPrivate = roomType === 'private';
    const isAnnouncement = roomType === 'announcement';
    const roomPassword = document.getElementById('room-password').value;
    
    if ((isPrivate || isAnnouncement) && !roomPassword) {
        alert('Veuillez entrer un mot de passe');
        return;
    }
    
    if ((isPrivate || isAnnouncement) && roomPassword.length < 4) {
        alert('Le mot de passe doit contenir au moins 4 caractères');
        return;
    }
    
    try {
        const response = await fetch('/create_room', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                room_name: roomName,
                is_private: isPrivate,
                is_announcement: isAnnouncement,
                room_password: roomPassword
            })
        });
        
        const data = await response.json();
        
        if (data.room_id) {
            currentRoom = data.room_id;
            currentRoomKey = data.room_key;
            
            // Stocker l'ID utilisateur depuis la session
            if (!currentUserId) {
                await getCurrentUser();
            }
            
            if (isAnnouncement) {
                canWrite = true;
                currentRoomPassword = roomPassword;
            }
            
            joinRoomUI(data.room_id, roomName, isPrivate, isAnnouncement);
            hideCreateRoomModal();
            startMessagePolling();
            
            let roomTypeText = isAnnouncement ? 'canal d\'annonces' : (isPrivate ? 'salon privé' : 'salon public');
            showNotification(`${roomTypeText} créé avec succès!`, 'success');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Erreur lors de la création de la salle');
    }
}

async function joinRoom() {
    const roomId = document.getElementById('room-id-input').value.trim();
    
    if (!roomId) {
        alert('Veuillez entrer un ID de salle');
        return;
    }
    
    try {
        const checkResponse = await fetch('/check_room_password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ room_id: roomId })
        });
        
        const checkData = await checkResponse.json();
        
        if (checkData.requires_password && !checkData.is_announcement) {
            const roomInfoResponse = await fetch(`/get_room_info/${roomId}`);
            const roomInfo = await roomInfoResponse.json();
            
            if (!roomInfo.error) {
                showPrivateRoomModal(roomId, roomInfo.name);
            } else {
                alert('Salle non trouvée');
            }
        } else {
            await completeRoomJoin(roomId, '');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Erreur lors de la connexion à la salle');
    }
}

async function joinPrivateRoom() {
    const roomPassword = document.getElementById('room-password-input').value;
    
    if (!roomPassword) {
        alert('Veuillez entrer le mot de passe');
        return;
    }
    
    await completeRoomJoin(pendingRoomId, roomPassword);
}

async function checkWritePermission() {
    const writePassword = document.getElementById('write-password-input').value;
    
    if (!writePassword) {
        alert('Veuillez entrer le mot de passe');
        return;
    }
    
    try {
        const response = await fetch('/check_write_permission', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                room_id: currentRoom,
                room_password: writePassword
            })
        });
        
        const data = await response.json();
        
        if (data.can_write) {
            canWrite = true;
            currentRoomPassword = writePassword;
            hideWritePermissionModal();
            document.getElementById('message-input').disabled = false;
            document.getElementById('message-input').placeholder = "Tapez votre message sécurisé...";
            document.getElementById('send-btn').disabled = false;
            document.getElementById('message-input-area').classList.remove('write-restricted');
            showNotification('Permission d\'écriture accordée!', 'success');
        } else {
            document.getElementById('write-password-error').style.display = 'block';
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Erreur de vérification');
    }
}

async function completeRoomJoin(roomId, roomPassword) {
    try {
        const response = await fetch('/join_room', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                room_id: roomId,
                room_password: roomPassword
            })
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                document.getElementById('password-error').style.display = 'block';
                return;
            }
            throw new Error('Erreur serveur');
        }
        
        const data = await response.json();
        
        if (data.room_key) {
            currentRoom = roomId;
            currentRoomKey = data.room_key;
            
            // Stocker l'ID utilisateur depuis la session
            if (!currentUserId) {
                await getCurrentUser();
            }
            
            if (data.is_private) {
                currentRoomPassword = roomPassword;
                canWrite = true;
            }
            
            joinRoomUI(roomId, data.room_name, data.is_private, data.is_announcement);
            hideJoinRoomModal();
            hidePrivateRoomModal();
            startMessagePolling();
            
            let roomType = data.is_announcement ? 'canal d\'annonces' : (data.is_private ? 'salon privé' : 'salon public');
            showNotification(`Connecté au ${roomType}!`, 'success');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Erreur lors de la connexion à la salle');
    }
}

function joinRoomUI(roomId, roomName, isPrivate, isAnnouncement) {
    document.getElementById('current-room').textContent = roomName;
    
    let roomTypeText = '🌐 Salon public';
    if (isPrivate) roomTypeText = '🔒 Salon privé';
    if (isAnnouncement) roomTypeText = '📢 Canal d\'annonces';
    
    document.getElementById('room-info').innerHTML = `
        <small>ID: ${roomId} | ${roomTypeText} | 🔐 Chiffrement AES-256 activé</small>
    `;
    document.getElementById('message-input-area').style.display = 'block';
    
    if (isAnnouncement && !canWrite) {
        document.getElementById('message-input').disabled = true;
        document.getElementById('message-input').placeholder = "Mot de passe requis pour écrire...";
        document.getElementById('send-btn').disabled = true;
        document.getElementById('message-input-area').classList.add('write-restricted');
    } else {
        document.getElementById('message-input').disabled = false;
        document.getElementById('message-input').placeholder = "Tapez votre message sécurisé...";
        document.getElementById('send-btn').disabled = false;
        document.getElementById('message-input-area').classList.remove('write-restricted');
    }
    
    document.getElementById('messages').innerHTML = '';
    loadMessages();
    
    // Scroll en bas après avoir rejoint le salon
    setTimeout(scrollToBottom, 300);
}

async function sendMessage() {
    const messageInput = document.getElementById('message-input');
    const message = messageInput.value.trim();
    
    if (!message || !currentRoom) return;
    
    if (!canWrite) {
        showWritePermissionModal(currentRoom, document.getElementById('current-room').textContent);
        return;
    }
    
    try {
        const response = await fetch('/send_message', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                room_id: currentRoom,
                message: message,
                room_password: currentRoomPassword
            })
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            messageInput.value = '';
            loadMessages();
            
            // Scroll en bas après l'envoi d'un message
            setTimeout(scrollToBottom, 100);
        } else if (data.error && data.error.includes('Permission refusée')) {
            canWrite = false;
            currentRoomPassword = '';
            showWritePermissionModal(currentRoom, document.getElementById('current-room').textContent);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Erreur lors de l\'envoi du message');
    }
}

async function loadMessages() {
    if (!currentRoom || !currentRoomKey) return;
    
    try {
        const response = await fetch('/get_messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                room_id: currentRoom,
                room_key: currentRoomKey
            })
        });
        
        const data = await response.json();
        
        if (data.messages) {
            // Vérifier s'il y a de nouveaux messages avant d'afficher
            const previousMessageCount = document.getElementById('messages').children.length;
            displayMessages(data.messages);
            const newMessageCount = data.messages.length;
            
            // CORRECTION : Jouer le son seulement si de nouveaux messages sont arrivés 
            // ET que l'utilisateur actuel n'est PAS l'expéditeur du dernier message
            if (newMessageCount > previousMessageCount && previousMessageCount > 0) {
                const lastMessage = data.messages[data.messages.length - 1];
                
                // Vérifier si le dernier message n'a pas été envoyé par l'utilisateur actuel
                if (lastMessage.user_id !== currentUserId) {
                    playNotificationSound();
                }
            }
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

function displayMessages(messages) {
    const messagesContainer = document.getElementById('messages');
    const currentUserId = getCurrentUserId();
    
    messagesContainer.innerHTML = '';
    
    messages.forEach(msg => {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${msg.user_id === currentUserId ? 'own' : 'other'}`;
        
        const timestamp = new Date(msg.timestamp).toLocaleTimeString();
        
        messageElement.innerHTML = `
            <div class="message-header">${escapeHtml(msg.username)}</div>
            <div class="message-content">${escapeHtml(msg.message)}</div>
            <div class="message-timestamp">${timestamp}</div>
        `;
        
        messagesContainer.appendChild(messageElement);
    });
    
    // Scroll automatique vers le bas
    setTimeout(scrollToBottom, 100);
}

function getCurrentUserId() {
    return currentUserId;
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        background: ${type === 'success' ? '#28a745' : '#007bff'};
        color: white;
        border-radius: 8px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

async function loadRooms() {
    try {
        const response = await fetch('/get_rooms');
        const data = await response.json();
        
        const roomsList = document.getElementById('rooms-list');
        roomsList.innerHTML = '';
        
        if (data.rooms.length === 0) {
            roomsList.innerHTML = '<p style="color: #6c757d; text-align: center;">Aucun salon disponible</p>';
            return;
        }
        
        data.rooms.forEach(room => {
            const roomElement = document.createElement('div');
            
            let roomClass = 'public';
            let badgeClass = 'public-badge';
            let badgeText = '🌐 Public';
            
            if (room.is_announcement) {
                roomClass = 'announcement';
                badgeClass = 'announcement-badge';
                badgeText = '📢 Annonces';
            } else if (room.is_private) {
                roomClass = 'private';
                badgeClass = 'private-badge';
                badgeText = '🔒 Privé';
            }
            
            roomElement.className = `room-item ${roomClass}`;
            roomElement.innerHTML = `
                <strong>${escapeHtml(room.name)}</strong>
                <span class="${badgeClass}">
                    ${badgeText}
                </span>
                <br>
                <small>Messages: ${room.message_count} | Utilisateurs: ${room.user_count}</small>
                <div class="room-privacy-info">
                    ID: ${room.id} • ${room.is_announcement ? 'Lecture libre, écriture restreinte' : (room.is_private ? 'Accès restreint' : 'Accès libre')}
                </div>
            `;
            roomElement.onclick = () => {
                if (room.is_private) {
                    showPrivateRoomModal(room.id, room.name);
                } else {
                    completeRoomJoin(room.id, '');
                }
            };
            roomsList.appendChild(roomElement);
        });
    } catch (error) {
        console.error('Error loading rooms:', error);
    }
}

// Gestion des événements
document.getElementById('message-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Fermer les modales en cliquant à l'extérieur
window.onclick = function(event) {
    const modals = document.getElementsByClassName('modal');
    for (let modal of modals) {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    }
}

function startMessagePolling() {
    if (messageInterval) {
        clearInterval(messageInterval);
    }
    
    messageInterval = setInterval(loadMessages, 2000);
}

// Initialisation
document.addEventListener('DOMContentLoaded', function() {
    // Récupérer l'ID utilisateur au chargement
    getCurrentUser();
    
    loadRooms();
    setInterval(loadRooms, 10000);
});
