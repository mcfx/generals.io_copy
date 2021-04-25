from flask import Flask, request, redirect, jsonify
from flask.helpers import send_file
from flask_socketio import SocketIO, join_room, leave_room, emit
import time, json, random, string, hashlib
from game import Game

app = Flask(__name__, static_url_path='')
socketio = SocketIO(app, async_mode='eventlet')

game_uid = {}
game_instance = {}


def md5(x):
	if type(x) is bytes:
		return hashlib.md5(x).hexdigest()
	return hashlib.md5(x.encode('utf-8')).hexdigest()


@app.route('/games/<game_id>')
def enter_room(game_id):
	if len(game_id) == 0 or len(game_id) > 15:
		return redirect('/games/' + (''.join([chr(random.randint(0, 25) + ord('a'))for i in range(4)])))
	return app.send_static_file('game.html')


@app.route('/')
def index():
	return app.send_static_file('index.html')


@app.route('/replays')
def replays():
	return app.send_static_file('replays.html')


@app.route('/games')
def get_games():
	res = ''
	cnt = 0
	for x in game_instance:
		cnt += 1
		res += 'Room%d: ' % cnt + ' '.join(game_instance[x].names) + '<br>'
	return res


@app.errorhandler(404)
def enter_random_room(_):
	return redirect('/games/' + (''.join([chr(random.randint(0, 25) + ord('a'))for i in range(4)])))


@app.route('/replays/<hs>')
def get_replays(hs):
	for x in hs:
		if x not in string.digits + string.ascii_letters + '+-':
			return ''
	return app.send_static_file('game.html')


@app.route('/api/getreplay/<hs>')
def get_replay(hs):
	for x in hs:
		if x not in string.digits + string.ascii_letters + '+-':
			return ''
	return send_file('replays/' + hs + '.json')


@app.route('/api/replays')
def list_replay():
	u = []
	for x in open('replays/all.txt').readlines():
		if x:
			u.append(json.loads(x))
	u.sort(key=lambda x: -x['time'])
	return jsonify(u)


@socketio.on('connect')
def on_connect():
	join_room('sid_' + request.sid)
	emit('set_id', md5(request.sid))


@socketio.on('attack')
def on_attack(data):
	if request.sid in game_uid:
		game_instance[game_uid[request.sid]].add_move(request.sid, int(data['x']), int(data['y']), int(data['dx']), int(data['dy']), bool(data['half']))


@socketio.on('clear_queue')
def on_clear_queue():
	if request.sid in game_uid:
		game_instance[game_uid[request.sid]].clear_queue(request.sid)


@socketio.on('pop_queue')
def on_clear_queue():
	if request.sid in game_uid:
		game_instance[game_uid[request.sid]].pop_queue(request.sid)


def emit_init_map(sid, data):
	socketio.emit('init_map', data, room='sid_' + sid)


def emit_update(sid, data):
	socketio.emit('update', data, room='sid_' + sid)


max_teams = 16
gr_val = {}
gr_id = {}
gr_conf = {}
gr_players = {}


def join_game_room(sid, uid, gid):
	gr_id[sid] = gid
	if gid not in gr_conf:
		gr_conf[gid] = {'width_ratio': 0.5, 'height_ratio': 0.5, 'city_ratio': 0.5, 'mountain_ratio': 0.5, 'swamp_ratio': 0.5, 'speed': 1, 'custom_map': ''}
		gr_players[gid] = []
	tcnt = [0] * (max_teams + 1)
	for i in gr_players[gid]:
		tcnt[i[2]] += 1
	mi = 1e9
	mp = 0
	for i in range(1, max_teams + 1):
		if tcnt[i] < mi:
			mi = tcnt[i]
			mp = i
	gr_players[gid].append([sid, uid, mp, False])


def leave_game_room(sid, gid):
	for i in range(len(gr_players[gid])):
		if gr_players[gid][i][0] == sid:
			t = i
			res = gr_players[gid][i][1]
	gr_players[gid].pop(t)
	return res


def get_req_ready(x):
	return x - int(x * 0.3)


def get_req(x):
	cnt = 0
	for i in x:
		if i[2]:
			cnt += 1
	return get_req_ready(cnt)


def gen_game_conf(gid):
	tmp = gr_conf[gid].copy()
	pl = []
	cnt = 0
	for i in gr_players[gid]:
		pl.append({'sid': md5(i[0]), 'uid': i[1], 'team': i[2], 'ready': bool(i[3] and i[2])})
		if i[2] and i[3]:
			cnt += 1
	need = get_req(gr_players[gid])
	tmp['players'] = pl
	tmp['ready'] = cnt
	tmp['need'] = need
	return tmp


def getval(gid):
	if gid not in gr_val:
		gr_val[gid] = md5(gid.encode('utf-8') + str(time.time()).encode())
	return gr_val[gid]


@socketio.on('join_game_room')
def on_join_game_room(data):
	ioroom = getval(data['room'])
	if request.sid not in gr_id:
		join_game_room(request.sid, data['nickname'], data['room'])
		join_room('game_' + ioroom)
		emit('room_update', gen_game_conf(data['room']), room='game_' + ioroom)
		send_system_message(ioroom, data['nickname'] + ' joined the custom lobby.')


@socketio.on('change_nickname')
def on_change_nickname(data):
	if request.sid in gr_id and len(data['nickname']) < 15 and len(data['nickname']) > 0:
		gid = gr_id[request.sid]
		ioroom = getval(gid)
		for i in gr_players[gid]:
			if i[0] == request.sid:
				old_name = i[1]
				i[1] = data['nickname']
		emit('room_update', gen_game_conf(gid), room='game_' + ioroom)
		if old_name != data['nickname']:
			send_system_message(ioroom, old_name + ' changed nickname to ' + data['nickname'] + '.')


@socketio.on('change_team')
def on_change_team(data):
	data['team'] = int(data['team'])
	if request.sid in gr_id and data['team'] >= 0 and data['team'] <= max_teams:
		gid = gr_id[request.sid]
		ioroom = getval(gid)
		for i in gr_players[gid]:
			if i[0] == request.sid:
				i[2] = data['team']
				nickname = i[1]
		emit('room_update', gen_game_conf(gid), room='game_' + ioroom)
		teamname = 'the spectators' if data['team'] == 0 else 'team ' + str(data['team'])
		send_system_message(ioroom, nickname + ' joined ' + teamname + '.')


@socketio.on('change_ready')
def on_change_ready(data):
	data['ready'] = bool(data['ready'])
	if request.sid in gr_id:
		gid = gr_id[request.sid]
		ioroom = getval(gid)
		for i in gr_players[gid]:
			if i[0] == request.sid:
				i[3] = data['ready']
		chk_ready(gid, ioroom)


def chk_ready(gid, ioroom):
	rcnt = 0
	for i in gr_players[gid]:
		if i[3] and i[2]:
			rcnt += 1
	if rcnt >= get_req(gr_players[gid]) and get_req(gr_players[gid]):
		start_game(gid)
	else:
		emit('room_update', gen_game_conf(gid), room='game_' + ioroom)


def chkfloat(x, l, r):
	x = float(x)
	if x < l or x > r:
		raise ''
	return x


conf_str = {}
conf_str['width_ratio'] = 'Width option'
conf_str['height_ratio'] = 'Height option'
conf_str['city_ratio'] = 'City Density option'
conf_str['mountain_ratio'] = 'Mountain Density option'
conf_str['swamp_ratio'] = 'Swamp Density option'
conf_str['speed'] = 'Game Speed option'
conf_str['custom_map'] = 'Custom Map'


def getstr(x):
	if type(x) is str:
		return x
	return str(x)


@socketio.on('change_game_conf')
def on_change_game_conf(data):
	tmp = {}
	tmp['width_ratio'] = chkfloat(data['width_ratio'], 0, 1)
	tmp['height_ratio'] = chkfloat(data['height_ratio'], 0, 1)
	tmp['city_ratio'] = chkfloat(data['city_ratio'], 0, 1)
	tmp['mountain_ratio'] = chkfloat(data['mountain_ratio'], 0, 1)
	tmp['swamp_ratio'] = chkfloat(data['swamp_ratio'], 0, 1)
	tmp['speed'] = chkfloat(data['speed'], 0.25, 16)
	tmp['custom_map'] = data['custom_map']
	if request.sid in gr_id and len(tmp['custom_map']) >= 0 and len(tmp['custom_map']) < 100:
		gid = gr_id[request.sid]
		ioroom = getval(gid)
		mess_q = []
		if gr_players[gid][0][0] == request.sid:
			for i in tmp:
				if tmp[i] != gr_conf[gid][i]:
					mess_q.append(i)
			gr_conf[gid] = tmp
		emit('room_update', gen_game_conf(gid), room='game_' + ioroom)
		for i in mess_q:
			send_system_message(ioroom, gr_players[gid][0][1] + ' changed the ' + conf_str[i] + ' to ' + getstr(tmp[i]) + '.')


def chk_leave():
	if request.sid in gr_id:
		gid = gr_id.pop(request.sid)
		ioroom = getval(gid)
		leave_room('game_' + ioroom)
		uid = leave_game_room(request.sid, gid)
		emit('room_update', gen_game_conf(gid), room='game_' + ioroom)
		send_system_message(ioroom, uid + ' left the custom lobby.')
		chk_ready(gid, ioroom)
	elif request.sid in game_uid:
		gid = game_uid.pop(request.sid)
		leave_room('game_' + gid)
		game_instance[gid].leave_game(request.sid)


@socketio.on('disconnect')
def on_disconnect():
	leave_room('sid_' + request.sid)
	chk_leave()


@socketio.on('leave')
def on_leave():
	chk_leave()
	socketio.emit('left', {}, room='sid_' + request.sid)


def start_game(gid):
	grc = gr_conf.pop(gid)
	grp = gr_players.pop(gid)
	tmp = gid
	gid = getval(tmp)
	gr_val.pop(tmp)
	for i in grp:
		gr_id.pop(i[0])
		game_uid[i[0]] = gid
	player_sids = []
	player_ids = []
	player_teams = []
	player_names = []
	for i in grp:
		player_sids.append(i[0])
		player_ids.append(md5(i[0]))
		player_names.append(i[1])
		player_teams.append(i[2])
	grc['player_names'] = player_names
	grc['player_teams'] = player_teams
	socketio.emit('starting', {}, room='game_' + gid)
	game = Game(grc, emit_update, emit_init_map, player_sids, player_ids, chat_message, gid, md5, end_game)
	game.start_game(socketio)
	game_instance[gid] = game


def end_game(gid):
	def wait_remove():
		socketio.sleep(1800)
		game_instance.pop(gid)
	socketio.start_background_task(wait_remove)


def send_system_message(gid, text):
	chat_message(gid, 'room', '', 0, text)


def chat_message(id, tp, sender, color, text, team=False):
	if tp == 'room':
		id = 'game_' + id
	elif tp == 'sid':
		id = 'sid_' + id
	socketio.emit('chat_message', {'sender': sender, 'color': color, 'text': text, 'team': team}, room=id)


@socketio.on('send_message')
def on_send_message(data):
	if request.sid in game_uid:
		game_instance[game_uid[request.sid]].send_message(request.sid, data)
	elif request.sid in gr_id:
		gid = gr_id[request.sid]
		ioroom = getval(gid)
		for i in range(len(gr_players[gid])):
			if gr_players[gid][i][0] == request.sid:
				color = i + 1
				uid = gr_players[gid][i][1]
		chat_message(ioroom, 'room', uid, color, data['text'])


if __name__ == '__main__':
	socketio.run(app, port=23333, host='0.0.0.0')
