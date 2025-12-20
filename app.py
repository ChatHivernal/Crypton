from flask import Flask, render_template, request, jsonify, session
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import secrets
import json
import base64
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad
from Crypto.Random import get_random_bytes
import hashlib
import bcrypt

app = Flask(__name__)
app.secret_key = secrets.token_hex(16)
app.config['SECRET_KEY'] = secrets.token_hex(16)

# Configuration de la base de données SQLite
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///crypton.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# Modèles de base de données
class User(db.Model):
    id = db.Column(db.String(16), primary_key=True)
    username = db.Column(db.String(50), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Room(db.Model):
    id = db.Column(db.String(16), primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    key = db.Column(db.LargeBinary, nullable=False)  # Clé de chiffrement
    created = db.Column(db.DateTime, default=datetime.utcnow)
    is_private = db.Column(db.Boolean, default=False)
    is_announcement = db.Column(db.Boolean, default=False)
    password_hash = db.Column(db.String(128))
    creator_id = db.Column(db.String(16), db.ForeignKey('user.id'))

class Message(db.Model):
    id = db.Column(db.String(16), primary_key=True)
    room_id = db.Column(db.String(16), db.ForeignKey('room.id'), nullable=False)
    user_id = db.Column(db.String(16), db.ForeignKey('user.id'), nullable=False)
    encrypted_message = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relations
    room = db.relationship('Room', backref=db.backref('messages', lazy=True))
    user = db.relationship('User', backref=db.backref('messages', lazy=True))

class RoomUser(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    room_id = db.Column(db.String(16), db.ForeignKey('room.id'), nullable=False)
    user_id = db.Column(db.String(16), db.ForeignKey('user.id'), nullable=False)
    joined_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    room = db.relationship('Room', backref=db.backref('room_users', lazy=True))
    user = db.relationship('User', backref=db.backref('room_users', lazy=True))

# Créer les tables
with app.app_context():
    db.create_all()

class CryptonCipher:
    def __init__(self, key=None):
        if key is None:
            key = get_random_bytes(32)
        self.key = hashlib.sha256(key).digest()

    def encrypt(self, message):
        cipher = AES.new(self.key, AES.MODE_CBC)
        ct_bytes = cipher.encrypt(pad(message.encode(), AES.block_size))
        iv = base64.b64encode(cipher.iv).decode('utf-8')
        ct = base64.b64encode(ct_bytes).decode('utf-8')
        return f"{iv}:{ct}"

    def decrypt(self, encrypted_message):
        try:
            iv, ct = encrypted_message.split(':')
            iv = base64.b64decode(iv)
            ct = base64.b64decode(ct)
            cipher = AES.new(self.key, AES.MODE_CBC, iv)
            pt = unpad(cipher.decrypt(ct), AES.block_size)
            return pt.decode()
        except Exception as e:
            return f"[Message chiffré non déchiffrable]"

@app.before_request
def make_session_permanent():
    session.permanent = True

@app.route('/')
def index():
    if 'user_id' not in session:
        user_id = secrets.token_hex(8)
        username = f"Anon_{secrets.token_hex(4)}"
        
        # Créer l'utilisateur en base de données
        user = User(id=user_id, username=username)
        db.session.add(user)
        db.session.commit()
        
        session['user_id'] = user_id
        session['username'] = username
    
    return render_template('index.html', username=session['username'])

@app.route('/get_current_user')
def get_current_user():
    return jsonify({
        'user_id': session.get('user_id'),
        'username': session.get('username')
    })

@app.route('/create_room', methods=['POST'])
def create_room():
    room_id = secrets.token_hex(8)
    room_key = get_random_bytes(32)
    room_password = request.json.get('room_password')
    is_private = request.json.get('is_private', False)
    is_announcement = request.json.get('is_announcement', False)
    
    password_hash = None
    if (is_private or is_announcement) and room_password:
        password_hash = bcrypt.hashpw(room_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    # Créer la salle en base de données
    room = Room(
        id=room_id,
        name=request.json.get('room_name', 'Nouvelle Salle'),
        key=room_key,
        is_private=is_private,
        is_announcement=is_announcement,
        password_hash=password_hash,
        creator_id=session['user_id']
    )
    
    db.session.add(room)
    db.session.commit()
    
    return jsonify({
        'room_id': room_id, 
        'room_key': base64.b64encode(room_key).decode(),
        'is_private': is_private,
        'is_announcement': is_announcement
    })

@app.route('/join_room', methods=['POST'])
def join_room():
    room_id = request.json.get('room_id')
    room_password = request.json.get('room_password', '')
    
    room = Room.query.get(room_id)
    if not room:
        return jsonify({'error': 'Salle non trouvée'}), 404
    
    # Pour les salons privés normaux, vérifier le mot de passe pour lire ET écrire
    if room.is_private and not room.is_announcement:
        if not room_password:
            return jsonify({'error': 'Mot de passe requis'}), 401
        
        if not room.password_hash or not bcrypt.checkpw(room_password.encode('utf-8'), room.password_hash.encode('utf-8')):
            return jsonify({'error': 'Mot de passe incorrect'}), 401
    
    # Ajouter l'utilisateur à la salle (si pas déjà présent)
    existing_room_user = RoomUser.query.filter_by(room_id=room_id, user_id=session['user_id']).first()
    if not existing_room_user:
        room_user = RoomUser(room_id=room_id, user_id=session['user_id'])
        db.session.add(room_user)
        db.session.commit()
    
    room_key = room.key
    return jsonify({
        'room_key': base64.b64encode(room_key).decode(),
        'room_name': room.name,
        'is_private': room.is_private,
        'is_announcement': room.is_announcement
    })

@app.route('/check_room_password', methods=['POST'])
def check_room_password():
    room_id = request.json.get('room_id')
    room_password = request.json.get('room_password', '')
    
    room = Room.query.get(room_id)
    if not room:
        return jsonify({'error': 'Salle non trouvée'}), 404
    
    if not room.is_private and not room.is_announcement:
        return jsonify({'requires_password': False})
    
    # Pour les canaux d'annonces, on peut toujours lire sans mot de passe
    if room.is_announcement:
        return jsonify({'requires_password': False, 'is_announcement': True})
    
    if room_password and room.password_hash and bcrypt.checkpw(room_password.encode('utf-8'), room.password_hash.encode('utf-8')):
        return jsonify({'requires_password': False, 'password_correct': True})
    
    return jsonify({'requires_password': True, 'password_correct': False})

@app.route('/check_write_permission', methods=['POST'])
def check_write_permission():
    room_id = request.json.get('room_id')
    room_password = request.json.get('room_password', '')
    
    room = Room.query.get(room_id)
    if not room:
        return jsonify({'error': 'Salle non trouvée'}), 404
    
    # Pour les salons publics, tout le monde peut écrire
    if not room.is_private and not room.is_announcement:
        return jsonify({'can_write': True})
    
    # Pour les canaux d'annonces, vérifier le mot de passe pour écrire
    if room.is_announcement:
        if room_password and room.password_hash and bcrypt.checkpw(room_password.encode('utf-8'), room.password_hash.encode('utf-8')):
            return jsonify({'can_write': True})
        else:
            return jsonify({'can_write': False, 'requires_password': True})
    
    # Pour les salons privés normaux, le mot de passe a déjà été vérifié à l'entrée
    return jsonify({'can_write': True})

@app.route('/send_message', methods=['POST'])
def send_message():
    room_id = request.json.get('room_id')
    message = request.json.get('message')
    username = session.get('username', 'Anonymous')
    
    room = Room.query.get(room_id)
    if not room:
        return jsonify({'error': 'Salle non trouvée'}), 404
    
    # Vérifier les permissions d'écriture pour les canaux d'annonces
    if room.is_announcement:
        room_password = request.json.get('room_password', '')
        if not room_password or not room.password_hash or not bcrypt.checkpw(room_password.encode('utf-8'), room.password_hash.encode('utf-8')):
            return jsonify({'error': 'Permission refusée - Mot de passe requis pour écrire'}), 403
    
    # Chiffrement du message
    room_key = room.key
    cipher = CryptonCipher(room_key)
    encrypted_message = cipher.encrypt(message)
    
    # Créer le message en base de données
    message_data = Message(
        id=secrets.token_hex(8),
        room_id=room_id,
        user_id=session['user_id'],
        encrypted_message=encrypted_message
    )
    
    db.session.add(message_data)
    
    # Garder seulement les 100 derniers messages par salle
    messages_count = Message.query.filter_by(room_id=room_id).count()
    if messages_count > 100:
        # Supprimer les messages les plus anciens au-delà de 100
        oldest_messages = Message.query.filter_by(room_id=room_id).order_by(Message.timestamp.asc()).limit(messages_count - 100).all()
        for msg in oldest_messages:
            db.session.delete(msg)
    
    db.session.commit()
    
    return jsonify({'status': 'success'})

@app.route('/get_messages', methods=['POST'])
def get_messages():
    room_id = request.json.get('room_id')
    room_key_b64 = request.json.get('room_key')
    
    room = Room.query.get(room_id)
    if not room:
        return jsonify({'error': 'Salle non trouvée'}), 404
    
    try:
        room_key = base64.b64decode(room_key_b64)
        cipher = CryptonCipher(room_key)
        
        # Récupérer les 100 derniers messages
        messages_db = Message.query.filter_by(room_id=room_id).order_by(Message.timestamp.asc()).limit(100).all()
        
        messages = []
        for msg in messages_db:
            try:
                decrypted_message = cipher.decrypt(msg.encrypted_message)
                messages.append({
                    'id': msg.id,
                    'username': msg.user.username,
                    'message': decrypted_message,
                    'timestamp': msg.timestamp.isoformat(),
                    'user_id': msg.user_id
                })
            except:
                messages.append({
                    'id': msg.id,
                    'username': msg.user.username,
                    'message': '[Message chiffré]',
                    'timestamp': msg.timestamp.isoformat(),
                    'user_id': msg.user_id
                })
        
        return jsonify({'messages': messages})
    
    except Exception as e:
        return jsonify({'error': 'Clé invalide'}), 400

@app.route('/update_username', methods=['POST'])
def update_username():
    new_username = request.json.get('username', '').strip()
    if new_username and len(new_username) <= 20:
        # Mettre à jour l'utilisateur en base de données
        user = User.query.get(session['user_id'])
        if user:
            user.username = new_username
            db.session.commit()
        
        session['username'] = new_username
        return jsonify({'status': 'success'})
    return jsonify({'error': 'Nom invalide'}), 400

@app.route('/get_rooms')
def get_rooms():
    # Récupérer toutes les salles avec le nombre d'utilisateurs et de messages
    rooms = Room.query.all()
    room_list = []
    
    for room in rooms:
        user_count = RoomUser.query.filter_by(room_id=room.id).count()
        message_count = Message.query.filter_by(room_id=room.id).count()
        
        # Récupérer la date du dernier message
        last_message = Message.query.filter_by(room_id=room.id).order_by(Message.timestamp.desc()).first()
        last_activity = last_message.timestamp if last_message else room.created
        
        room_list.append({
            'id': room.id,
            'name': room.name,
            'user_count': user_count,
            'message_count': message_count,
            'is_private': room.is_private,
            'is_announcement': room.is_announcement,
            'created': room.created.isoformat(),
            'last_activity': last_activity.isoformat()  # Ajout de la dernière activité
        })
    
    return jsonify({'rooms': room_list})

@app.route('/get_room_info/<room_id>')
def get_room_info(room_id):
    room = Room.query.get(room_id)
    if not room:
        return jsonify({'error': 'Salle non trouvée'}), 404
    
    user_count = RoomUser.query.filter_by(room_id=room_id).count()
    message_count = Message.query.filter_by(room_id=room_id).count()
    
    return jsonify({
        'id': room_id,
        'name': room.name,
        'is_private': room.is_private,
        'is_announcement': room.is_announcement,
        'user_count': user_count,
        'message_count': message_count,
        'created': room.created.isoformat()
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3030, debug=True)
