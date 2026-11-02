import random
import time
import string
from flask import Flask, render_template, request, session, redirect, url_for
from flask_socketio import SocketIO, emit, join_room, leave_room

app = Flask(__name__)
app.config['SECRET_KEY'] = 'dev-secret-key-change-in-production'
socketio = SocketIO(app, cors_allowed_origins="*")

# Структура сесій:
# {
#   "ROOM_CODE": {
#       "players": { sid: {"sid": sid, "name": name} },
#       "active_player": None,
#       "is_round_active": False
#   }
# }
games = {}


def generate_room_code(length=6):
    """Генерує унікальний цифровий код кімнати."""
    while True:
        #code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))
        code = ''.join(random.choices(string.digits, k=length))
        if code not in games:
            return code


# --- Routes ---

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/join', methods=['GET', 'POST'])
def join():
    if request.method == 'POST':
        name = request.form.get('name', '').strip()
        room_code = request.form.get('room_code', '').strip().upper()

        if name and room_code in games:
            session['player_name'] = name
            session['room_code'] = room_code
            return redirect(url_for('game'))
        elif room_code not in games:
            return render_template('join.html', error="Кімнату з таким кодом не знайдено!")
            
    return render_template('join.html', room_code=request.args.get('room_code', '').strip().upper())


@app.route('/game')
def game():
    if 'player_name' not in session or 'room_code' not in session:
        return redirect(url_for('join'))
    return render_template(
        'game.html', 
        player_name=session['player_name'], 
        room_code=session['room_code']
    )


@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        password = request.form.get('password')
        if password == 'admin123':
            session['is_admin'] = True
            return redirect(url_for('admin'))
    return render_template('login.html')


@app.route('/admin')
def admin():
    if not session.get('is_admin'):
        return redirect(url_for('login'))
    return render_template('admin.html')


# --- SocketIO Events ---

@socketio.on('admin_create_game')
def handle_create_game():
    """Адмін створює нову гру і отримує код кімнати."""
    room_code = generate_room_code()
    games[room_code] = {
        "players": {},
        "active_player": None,
        "active_sid": None,
        "excluded": set(),
        "remaining": 0,
        "round_end": 0,
        "is_round_active": False
    }
    join_room(room_code)
    session['room_code'] = room_code
    emit('game_created', {'room_code': room_code})
    emit('players_updated', [], room=room_code)


@socketio.on('join_room_request')
def handle_join_room_request(data):
    """Підключення будь-якого клієнта (гравець, адмін, табло) до кімнати."""
    sid = request.sid
    room_code = data.get('room_code', '').upper()
    role = data.get('role')  # 'player', 'admin', 'board'
    name = data.get('name')

    if room_code not in games:
        emit('error', {'message': 'Кімнату не знайдено'})
        return

    join_room(room_code)
    game = games[room_code]

    if role == 'player' and name:
        game['players'][sid] = {"sid": sid, "name": name}
        # Зберігаємо прив'язку сокета до кімнати в об'єкті запиту SocketIO
        session['socket_room'] = room_code

    # Миттєво надсилаємо початковий стан новопідключеному клієнту
    emit('players_updated', list(game['players'].values()), room=room_code)
    
    if game['active_player']:
        emit('button_pressed_first', {'winner': game['active_player']}, room=sid)


@socketio.on('disconnect')
def handle_disconnect():
    sid = request.sid
    room_code = session.get('socket_room')
    
    if room_code and room_code in games:
        if sid in games[room_code]['players']:
            del games[room_code]['players'][sid]
            emit('players_updated', list(games[room_code]['players'].values()), room=room_code)


@socketio.on('press_button')
def handle_press_button(data):
    sid = request.sid
    room_code = data.get('room_code')

    if room_code in games:
        game = games[room_code]
        if game['is_round_active'] and game['active_player'] is None and sid not in game['excluded']:
            player = game['players'].get(sid)
            if player:
                game['active_player'] = player['name']
                game['active_sid'] = sid
                game['is_round_active'] = False
                game['remaining'] = max(0, int(game['round_end'] - time.time() + 0.5))
                emit('button_pressed_first', {
                    'winner': player['name'],
                    'sid': sid
                }, room=room_code)


@socketio.on('admin_start')
def handle_admin_start(data):
    room_code = data.get('room_code')
    duration = int(data.get('duration', 30))

    if room_code in games:
        game = games[room_code]
        game['is_round_active'] = True
        game['active_player'] = None
        game['active_sid'] = None
        game['excluded'] = set()
        game['round_end'] = time.time() + duration
        emit('round_started', {'duration': duration}, room=room_code)


@socketio.on('admin_continue')
def handle_admin_continue(data):
    """Гравець натиснув, але не відповів: відкриваємо кнопку іншим, поки є час."""
    room_code = data.get('room_code')

    if room_code in games:
        game = games[room_code]
        if game['active_player'] is None or game['remaining'] <= 0:
            return
        game['excluded'].add(game['active_sid'])
        game['active_player'] = None
        game['active_sid'] = None
        game['is_round_active'] = True
        game['round_end'] = time.time() + game['remaining']
        excluded_names = [p['name'] for s, p in game['players'].items() if s in game['excluded']]
        emit('round_continued', {
            'remaining': game['remaining'],
            'excluded': excluded_names
        }, room=room_code)


@socketio.on('admin_reset')
def handle_admin_reset(data):
    room_code = data.get('room_code')

    if room_code in games:
        game = games[room_code]
        game['is_round_active'] = False
        game['active_player'] = None
        game['active_sid'] = None
        game['excluded'] = set()
        emit('round_reset', room=room_code)


@socketio.on('admin_kick')
def handle_admin_kick(data):
    room_code = data.get('room_code')
    target_sid = data.get('sid')

    if room_code in games and target_sid in games[room_code]['players']:
        del games[room_code]['players'][target_sid]
        emit('kicked', room=target_sid)
        leave_room(room_code, sid=target_sid)
        emit('players_updated', list(games[room_code]['players'].values()), room=room_code)


if __name__ == '__main__':
    socketio.run(app, debug=True)