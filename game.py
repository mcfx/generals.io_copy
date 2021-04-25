import sys, time, json, math, base64, random, hashlib, eventlet, threading, requests

# type: 0=empty 1=mountain 2=swamp -1=city -2=general

default_width = 45
max_city_ratio = 0.04
max_swamp_ratio = 0.16
max_mountain_ratio = 0.24
left_game = 52


def chkconn(grid_type, n, m):
	fa = [i for i in range(n * m)]
	sz = [1] * (n * m)

	def find(x):
		if x == fa[x]:
			return x
		fa[x] = find(fa[x])
		return fa[x]

	def merge(x, y):
		x = find(x)
		y = find(y)
		if x != y:
			sz[y] += sz[x]
			fa[x] = y
	cnt = 0
	for i in range(n):
		for j in range(m):
			if grid_type[i][j] != 1:
				if i + 1 < n and grid_type[i + 1][j] != 1:
					merge(i * m + j, i * m + j + m)
				if j + 1 < m and grid_type[i][j + 1] != 1:
					merge(i * m + j, i * m + j + 1)
			else:
				cnt += 1
	for i in range(n * m):
		if sz[i] > (n * m - cnt) * 0.9:
			return (i // m, i % m)
	return (-1, -1)


def get_st(grid_type, n, m, res):
	fa = [i for i in range(n * m)]
	sz = [1] * (n * m)

	def find(x):
		if x == fa[x]:
			return x
		fa[x] = find(fa[x])
		return fa[x]

	def merge(x, y):
		x = find(x)
		y = find(y)
		if x != y:
			sz[y] += sz[x]
			fa[x] = y
	cnt = 0
	for i in range(n):
		for j in range(m):
			if grid_type[i][j] != 1:
				if i + 1 < n and grid_type[i + 1][j] != 1:
					merge(i * m + j, i * m + j + m)
				if j + 1 < m and grid_type[i][j + 1] != 1:
					merge(i * m + j, i * m + j + 1)
			else:
				cnt += 1
	max_sz = 0
	for i in range(n * m):
		max_sz = max(max_sz, sz[i])
	for i in range(n * m):
		if sz[find(i)] == max_sz:
			res[i // m][i % m] = True


def get_diff(a, b):
	res = []
	for i in range(len(a)):
		if a[i] != b[i]:
			res.append(i)
			res.append(a[i])
	return res


class Game:
	def __init__(self, game_conf, update, emit_init_map, player_ids, rplayer_ids, chat_message, gid, md5, end_game):
		print('start game:', gid, player_ids, game_conf['player_names'])
		sys.stdout.flush()
		self.otime = time.time()
		self.md5 = md5
		self.end_game = end_game
		self.player_ids = player_ids
		self.player_ids_rev = {}
		for i in range(len(player_ids)):
			self.player_ids_rev[player_ids[i]] = i
		self.update = update
		self.pcnt = len(player_ids)
		self.speed = game_conf['speed']
		self.names = game_conf['player_names']
		self.team = game_conf['player_teams']
		self.rpcnt = 0
		for i in self.team:
			if i:
				self.rpcnt += 1
		self.width_ratio = game_conf['width_ratio'] / 2 + 0.5
		self.height_ratio = game_conf['height_ratio'] / 2 + 0.5
		self.city_ratio = game_conf['city_ratio']
		self.mountain_ratio = game_conf['mountain_ratio']
		self.swamp_ratio = game_conf['swamp_ratio']
		self.pstat = [0 for i in player_ids]
		self.pmove = [[] for i in player_ids]
		self.lst_move = [(-1, -1, -1, -1, False) for i in player_ids]
		self.watching = [True for i in player_ids]
		self.spec = [False for i in player_ids]
		self.grid_type_lst = [[] for i in player_ids]
		self.army_cnt_lst = [[] for i in player_ids]
		self.deadorder = [0] * len(player_ids)
		self.deadcount = 0
		self.chat_message = chat_message
		self.gid = gid
		self.lock = threading.RLock()
		self.turn = 0
		self.recentkills = {}
		self.history = []
		if game_conf['custom_map'] != '':
			self.getcustommap(game_conf['custom_map'])
		else:
			self.genmap()
		self.sel_generals()
		for i in range(self.pcnt):
			emit_init_map(self.player_ids[i], {'n': self.n, 'm': self.m, 'player_ids': rplayer_ids, 'general': self.generals[i]})

	def send_message(self, sid, data):
		id = self.player_ids_rev[sid]
		uid = self.names[id]
		if data['team']:
			for i in range(self.pcnt):
				if self.team[i] == self.team[id]:
					self.chat_message(self.player_ids[i], 'sid', uid, id + 1, data['text'], True)
		else:
			self.chat_message(self.gid, 'room', uid, id + 1, data['text'])

	def send_system_message(self, text):
		self.chat_message(self.gid, 'room', '', 0, text)

	def getcustommap(self, title):
		try:
			r = requests.get('http://generals.io/api/map', params={'name': title.encode('utf-8')}).json()
			n = r['height']
			m = r['width']
			t = r['map'].split(',')
			self.owner = [[0 for j in range(m)] for i in range(n)]
			self.army_cnt = [[0 for j in range(m)] for i in range(n)]
			self.grid_type = [[0 for j in range(m)] for i in range(n)]
			for i in range(n):
				for j in range(m):
					x = t[i * m + j].strip(' ')
					if x == 'm':
						self.grid_type[i][j] = 1
					elif x == 's':
						self.grid_type[i][j] = 2
					elif x == 'g':
						self.grid_type[i][j] = -2
					elif x == 's':
						self.grid_type[i][j] = 2
					elif len(x):
						if x[0] == 'n':
							self.army_cnt[i][j] = int(x[1:])
						else:
							self.army_cnt[i][j] = int(x)
							self.grid_type[i][j] = -1
			self.n = n
			self.m = m
			self.st = [[False for j in range(m)] for i in range(n)]
			get_st(self.grid_type, n, m, self.st)
			self.is_custom = True
		except:
			self.genmap()

	def genmap(self):
		self.is_custom = False
		ni = random.randint(default_width - 5, default_width + 5)
		mi = default_width * default_width // ni
		self.n = n = int(ni * self.height_ratio)
		self.m = m = int(mi * self.width_ratio)
		city_ratio = max_city_ratio * self.city_ratio
		swamp_ratio = city_ratio + max_swamp_ratio * self.swamp_ratio
		mountain_ratio = swamp_ratio + max_mountain_ratio * self.mountain_ratio
		while True:
			grid_type = [[0 for j in range(m)] for i in range(n)]
			for i in range(n):
				for j in range(m):
					tmp = random.random()
					grid_type[i][j] = -1 if tmp < city_ratio else 2 if tmp < swamp_ratio else 1 if tmp < mountain_ratio else 0
			x, y = chkconn(grid_type, n, m)
			if x != -1:
				break
		self.grid_type = grid_type
		self.st = [[False for j in range(m)] for i in range(n)]
		get_st(grid_type, n, m, self.st)
		self.owner = [[0 for j in range(m)] for i in range(n)]
		self.army_cnt = [[0 for j in range(m)] for i in range(n)]
		for i in range(n):
			for j in range(m):
				if self.grid_type[i][j] == -1:
					self.army_cnt[i][j] = random.randint(40, 50)

	def sel_generals(self):
		ges = []
		gevals = []
		while len(ges) < 500:
			ge = []
			sp = []
			for i in range(self.n):
				for j in range(self.m):
					if self.st[i][j]:
						if self.grid_type[i][j] == -2:
							ge.append((i, j))
						elif self.grid_type[i][j] == 0:
							sp.append((i, j))
			random.shuffle(sp)
			if self.rpcnt > len(ge):
				for i in range(min(self.rpcnt - len(ge), len(sp))):
					ge.append(sp[i])
			if self.rpcnt > len(ge):
				for i in range(self.pcnt - len(ge)):
					ge.append((-1, -1))
			random.shuffle(ge)
			tv = 0
			for i in range(self.rpcnt):
				for j in range(i):
					tdis = abs(ge[i][0] - ge[j][0]) + abs(ge[i][1] - ge[j][1])
					tv += 0.88**tdis + max(0, 9 - tdis)
			ges.append(ge)
			tv += 1e-8
			tv = 1 / tv
			if self.is_custom:
				tv = tv**1.2
			else:
				tv = tv**2.2
			gevals.append(tv)
		gmax = max(gevals)
		for i in range(len(ges)):
			gevals[i] = int(gevals[i] / gmax * 100000)
		gpos = random.randint(0, sum(gevals) - 1)
		for i in range(len(ges)):
			if gevals[i] > gpos:
				ge = ges[i]
				break
			gpos -= gevals[i]
		for i in range(self.n):
			for j in range(self.m):
				if self.st[i][j]:
					if self.grid_type[i][j] == -2:
						self.grid_type[i][j] = 0
		self.generals = [(-1, -1)for _ in range(self.pcnt)]
		cu = 0
		for i in range(self.pcnt):
			if self.team[i] == 0:
				self.pstat[i] = left_game
			else:
				if ge[cu] == (-1, -1):
					self.pstat[i] = left_game
				else:
					self.generals[i] = ge[cu]
					self.grid_type[ge[cu][0]][ge[cu][1]] = -2
					self.owner[ge[cu][0]][ge[cu][1]] = i + 1
					self.army_cnt[ge[cu][0]][ge[cu][1]] = 1
				cu += 1

	def chkxy(self, x, y):
		return x >= 0 and y >= 0 and x < self.n and y < self.m

	def sendmap(self, stat):
		history_hash = None
		dx = [0, -1, 1, 0, 0, -1, -1, 1, 1]
		dy = [0, 0, 0, -1, 1, -1, 1, -1, 1]
		pl_v = [[0, 0] for i in range(self.pcnt)]
		for i in range(self.n):
			for j in range(self.m):
				if self.owner[i][j]:
					pl_v[self.owner[i][j] - 1][0] += self.army_cnt[i][j]
					pl_v[self.owner[i][j] - 1][1] += 1
		kls = self.recentkills
		self.recentkills = {}
		leaderboard = []
		for i in range(self.pcnt):
			cl = ''
			if self.pstat[i] == left_game:
				cl = 'dead'
			elif self.pstat[i]:
				cl = 'afk'
			if self.team[i]:
				leaderboard.append({'team': self.team[i], 'uid': self.names[i], 'army': pl_v[i][0], 'land': pl_v[i][1], 'class_': cl, 'dead': self.deadorder[i], 'id': i + 1})
		for p in range(-1, self.pcnt):
			if p == -1 or self.watching[p]:
				rt = [[0 for j in range(self.m)] for i in range(self.n)]
				rc = [[0 for j in range(self.m)] for i in range(self.n)]
				for i in range(self.n):
					for j in range(self.m):
						if p == -1 or self.team[p] == 0 or self.spec[p]:
							rt[i][j] = 200
						else:
							rt[i][j] = 202
							for d in range(9):
								if self.chkxy(i + dx[d], j + dy[d]) and self.owner[i + dx[d]][j + dy[d]] != 0 and self.team[self.owner[i + dx[d]][j + dy[d]] - 1] == self.team[p]:
									rt[i][j] = 200
						rc[i][j] = self.army_cnt[i][j] if rt[i][j] == 200 else 0
				for i in range(self.n):
					for j in range(self.m):
						if self.grid_type[i][j] == 2:
							rt[i][j] = 205 if rt[i][j] == 202 else 204 if self.owner[i][j] == 0 else self.owner[i][j] + 150
						elif self.grid_type[i][j] == 1:
							rt[i][j] = 201 if rt[i][j] == 200 else 203
						elif self.grid_type[i][j] == -1:
							rt[i][j] = self.owner[i][j] + 50 if rt[i][j] == 200 else 203
						elif self.grid_type[i][j] == -2:
							rt[i][j] = self.owner[i][j] + 100 if rt[i][j] == 200 else 202
						elif self.grid_type[i][j] == 0:
							rt[i][j] = 202 if rt[i][j] == 202 else self.owner[i][j] if self.owner[i][j] or self.army_cnt[i][j] else 200
				rt2 = []
				rc2 = []
				for i in range(self.n):
					for j in range(self.m):
						rt2.append(rt[i][j])
						rc2.append(rc[i][j])
				tmp = self.lst_move[p]
				if p == -1 or self.turn % 50 == 0 or random.randint(0, 50) == 0:
					res_data = {
						'grid_type': rt2,
						'army_cnt': rc2,
						'lst_move': {'x': tmp[0], 'y': tmp[1], 'dx': tmp[2], 'dy': tmp[3], 'half': tmp[4]},
						'leaderboard': leaderboard,
						'turn': self.turn,
						'kills': kls,
						'game_end': stat,
						'is_diff': False,
					}
				else:
					res_data = {
						'grid_type': get_diff(rt2, self.grid_type_lst[p]),
						'army_cnt': get_diff(rc2, self.army_cnt_lst[p]),
						'lst_move': {'x': tmp[0], 'y': tmp[1], 'dx': tmp[2], 'dy': tmp[3], 'half': tmp[4]},
						'leaderboard': leaderboard,
						'turn': self.turn,
						'kills': kls,
						'game_end': stat,
						'is_diff': True,
					}
				if history_hash:
					res_data['replay'] = history_hash
				if p != -1:
					self.grid_type_lst[p] = rt2
					self.army_cnt_lst[p] = rc2
					self.lst_move[p] = (-1, -1, -1, -1, False)
					self.update(self.player_ids[p], res_data)
				else:
					self.history.append(res_data)
					if stat:
						history_hash = self.save_history()

	def add_move(self, player, x, y, dx, dy, half):
		player = self.player_ids_rev[player]
		self.lock.acquire()
		self.pmove[player].append((x, y, dx, dy, half))
		self.lock.release()

	def clear_queue(self, player):
		player = self.player_ids_rev[player]
		self.lock.acquire()
		self.pmove[player] = []
		self.lock.release()

	def pop_queue(self, player):
		player = self.player_ids_rev[player]
		self.lock.acquire()
		if len(self.pmove[player]):
			self.pmove[player].pop()
		self.lock.release()

	def kill(self, a, b):
		for i in range(self.n):
			for j in range(self.m):
				if self.owner[i][j] == b:
					self.owner[i][j] = a
					self.army_cnt[i][j] = (self.army_cnt[i][j] + 1) // 2
					if self.grid_type[i][j] == -2:
						self.grid_type[i][j] = -1
		self.pstat[b - 1] = left_game
		self.deadcount += 1
		self.deadorder[b - 1] = self.deadcount
		self.spec[b - 1] = True
		if a > 0 and b > 0:
			self.recentkills[self.md5(self.player_ids[b - 1])] = self.names[a - 1]
			self.send_system_message(self.names[a - 1] + ' captured ' + self.names[b - 1] + '.')

	def chkmove(self, x, y, dx, dy, p):
		return self.chkxy(x, y) and self.chkxy(dx, dy) and abs(x - dx) + abs(y - dy) == 1 and self.owner[x][y] == p + 1 and self.army_cnt[x][y] > 0 and self.grid_type[dx][dy] != 1

	def attack(self, x, y, dx, dy, half):
		cnt = self.army_cnt[x][y] - 1
		if half:
			cnt //= 2
		self.army_cnt[x][y] -= cnt
		if self.owner[dx][dy] == self.owner[x][y]:
			self.army_cnt[dx][dy] += cnt
		elif self.owner[dx][dy] > 0 and self.owner[x][y] > 0 and self.team[self.owner[dx][dy] - 1] == self.team[self.owner[x][y] - 1]:
			self.army_cnt[dx][dy] += cnt
			if self.grid_type[dx][dy] != -2:
				self.owner[dx][dy] = self.owner[x][y]
		else:
			if cnt <= self.army_cnt[dx][dy]:
				self.army_cnt[dx][dy] -= cnt
			else:
				tmp = cnt - self.army_cnt[dx][dy]
				if self.grid_type[dx][dy] == -2:
					self.kill(self.owner[x][y], self.owner[dx][dy])
					self.grid_type[dx][dy] = -1
				self.army_cnt[dx][dy] = tmp
				self.owner[dx][dy] = self.owner[x][y]

	def game_tick(self):
		self.turn += 1
		if self.turn % 2 == 0:
			for i in range(self.n):
				for j in range(self.m):
					if self.grid_type[i][j] < 0 and self.owner[i][j] > 0:
						self.army_cnt[i][j] += 1
					elif self.grid_type[i][j] == 2 and self.owner[i][j] > 0:
						self.army_cnt[i][j] -= 1
						if self.army_cnt[i][j] == 0:
							self.owner[i][j] = 0
		if self.turn % 50 == 0:
			for i in range(self.n):
				for j in range(self.m):
					if self.owner[i][j] > 0:
						self.army_cnt[i][j] += 1
		for p in range(self.pcnt):
			if self.pstat[p]:
				self.pstat[p] = min(self.pstat[p] + 1, left_game)
				if self.pstat[p] == left_game - 1:
					self.kill(0, p + 1)
		tmp = range(self.pcnt)
		if self.turn % 2 == 1:
			tmp = list(reversed(tmp))
		self.lock.acquire()
		for p in tmp:
			while len(self.pmove[p]):
				mv = self.pmove[p].pop(0)
				if not self.chkmove(mv[0], mv[1], mv[2], mv[3], p):
					continue
				self.attack(mv[0], mv[1], mv[2], mv[3], mv[4])
				self.lst_move[p] = (mv[0], mv[1], mv[2], mv[3], mv[4])
				break
		self.lock.release()
		alive_team = {}
		for p in tmp:
			if self.pstat[p] != left_game:
				alive_team[self.team[p]] = True
		stat = len(alive_team) <= 1
		self.sendmap(stat)
		return stat

	def leave_game(self, sid):
		id = self.player_ids_rev[sid]
		if self.pstat[id] == 0:
			self.pstat[id] = 1
		self.watching[id] = False
		self.send_system_message(self.names[id] + ' left.')

	def save_history(self):
		res = {
			'n': self.n,
			'm': self.m,
			'history': self.history,
		}
		s = json.dumps(res, separators=(',', ':'))
		hs = base64.b64encode(hashlib.sha256(s.encode()).digest()[:9]).decode().replace('/', '-')
		open('replays/' + hs + '.json', 'w', encoding='utf-8').write(s)
		ranks = [x['uid']for x in sorted(self.history[-1]['leaderboard'], key=lambda x: x['dead'] + x['land'] * 100 + x['army'] * 10000000, reverse=True)]
		u = json.dumps({
			'time': int(time.time()),
			'id': hs,
			'rank': ranks,
			'turn': self.history[-1]['turn'] // 2,
		}) + '\n'
		open('replays/all.txt', 'a', encoding='utf-8').write(u)
		return hs

	def game_loop(self):
		eventlet.sleep(max(0.01, self.otime + 2 - time.time()))
		lst = time.time()
		self.sendmap(False)
		while True:
			eventlet.sleep(max(0.01, 0.5 / self.speed - time.time() + lst))
			lst = time.time()
			if self.game_tick():
				break
		res = ''
		for p in range(self.pcnt):
			if self.pstat[p] != left_game:
				if res != '':
					res += ','
				res += self.names[p]
		print('end game', self.gid)
		sys.stdout.flush()
		self.send_system_message(res + ' win.')
		self.end_game(self.gid)

	def start_game(self, socketio):
		socketio.start_background_task(target=self.game_loop)
