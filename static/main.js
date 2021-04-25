//map format
//n,m,turn
//grid_type[n][m] byte 0~49=army 50~99=city 100~149=generals 150~199=swamp with army 200=empty 201=mountain 202=fog 203=obstacle 204=swamp 205=swamp+fog
//army_cnt[n][m] int

$(document).ready(function () {
	x = -1, y = -1;
	$('body').on('mousedown', function (e) {
		x = e.pageX, y = e.pageY;
	});
	$('body').on('mousemove', function (e) {
		var w, X, Y;
		if (typeof (e.originalEvent.buttons) == "undefined") {
			w = e.which;
		} else {
			w = e.originalEvent.buttons;
		}
		X = e.clientX || e.originalEvent.clientX;
		Y = e.clientY || e.originalEvent.clientY;
		if (w == 1) {
			$('#map').css('left', parseInt($('#map').css('left')) - x + X);
			$('#map').css('top', parseInt($('#map').css('top')) - y + Y);
			x = e.pageX, y = e.pageY;
		}
	});
	var touches = [], expected_scale;
	function startTouch(s) {
		expected_scale = scale_sizes[scale];
		if (s.length <= 2) touches = s;
		else touches = [];
	}
	function handleMove(s) {
		var x = touches[0].pageX, y = touches[0].pageY, X = s[0].pageX, Y = s[0].pageY;
		$('#map').css('left', parseInt($('#map').css('left')) - x + X);
		$('#map').css('top', parseInt($('#map').css('top')) - y + Y);
	}
	function dis(a, b) {
		return Math.sqrt((a.pageX - b.pageX) * (a.pageX - b.pageX) + (a.pageY - b.pageY) * (a.pageY - b.pageY));
	}
	function moveTouch(s) {
		console.log(s);
		if (touches.length == 0) return;
		if (touches.length == 1) {
			if (s.length == 1) {
				handleMove(s);
				touches = s;
			} else if (s.length == 2) {
				var dis1 = dis(touches[0], s[0]), dis2 = dis(touches[0], s[1]);
				if (dis1 > dis2) s = [s[1], s[0]];
				handleMove(s);
				touches = s;
			} else {
				touches = [];
			}
		} else {
			if (s.length == 1) {
				var dis1 = dis(touches[0], s[0]), dis2 = dis(touches[1], s[0]);
				if (dis1 > dis2) touches = [touches[1], touches[0]];
				handleMove(s);
				touches = s;
			} else if (s.length == 2) {
				var x = (touches[0].pageX + touches[1].pageX) / 2, y = (touches[0].pageY + touches[1].pageY) / 2;
				var X = (s[0].pageX + s[1].pageX) / 2, Y = (s[0].pageY + s[1].pageY) / 2;
				$('#map').css('left', parseInt($('#map').css('left')) - x + X);
				$('#map').css('top', parseInt($('#map').css('top')) - y + Y);
				var dis1 = dis(touches[0], touches[1]), dis2 = dis(s[0], s[1]);
				expected_scale *= dis2 / dis1;
				if (expected_scale.toString().toLowerCase().indexOf('n') != -1) {
					expected_scale = scale_sizes[scale];
				} else {
					var pos, mi = 200;
					for (var i = 1; i < scale_sizes.length; i++) {
						var t = Math.abs(scale_sizes[i] - expected_scale);
						if (t < mi) mi = t, pos = i;
					}
					if (pos != scale) {
						scale = pos;
						if (typeof (localStorage) != "undefined") {
							localStorage.scale = scale.toString();
						}
						render();
					}
				}
				touches = s;
			} else {
				touches = [];
			}
		}
	}
	function endTouch() {
		touches = [];
	}
	function bindTouch(obj) {
		obj.addEventListener('touchstart', function (e) {
			if (!in_game) return;
			startTouch(e.targetTouches);
		}, false);
		obj.addEventListener('touchmove', function (e) {
			if (!in_game) return;
			moveTouch(e.targetTouches);
		}, false);
		obj.addEventListener('touchend', function (e) {
			if (!in_game) return;
			moveTouch(e.targetTouches);
			endTouch();
		}, false);
	}
	bindTouch(document);

	if (window.innerWidth <= 1000) {
		// shoule be mobile
		$('#turn-counter').attr('class', 'mobile');
		$('#game-leaderboard').attr('class', 'mobile');
		$('#replay-top-left').attr('class', 'mobile');
	}
});

function htmlescape(x) {
	return $('<div>').text(x).html();
}

const dire = [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 }];
const dire_char = ['↑', '↓', '←', '→'];
const dire_class = ['arrow_u', 'arrow_d', 'arrow_l', 'arrow_r'];

const scale_sizes = [0, 20, 25, 32, 40, 50, 60];

var n, m, turn, player, scale, selx, sely, selt, in_game = false;
var grid_type, army_cnt, have_route = Array(4);
var route;

var room_id = '', client_id, ready_state = 0, lost;
var max_teams = 16;

var chat_focus = false, is_team = false, starting_audio;

var is_replay = false, replay_id = false, replay_data = [], rcnt = 0, cur_turn = 0, is_autoplaying = false, autoplay_speed = 1;

if (location.pathname.substr(0, 8) == '/replays') {
	is_replay = true;
	replay_id = location.pathname.substr(9);
	$.get('/api/getreplay/' + replay_id, function (data) {
		replay_data = data;
		replayStart();
	});
}

function replayStart() {
	rcnt++;
	if (rcnt == 2) {
		init_map(replay_data.n, replay_data.m);
		in_game = true;
		update(replay_data.history[0]);
	}
}

function init_map(_n, _m, general) {
	chat_focus = false;
	$('#chatroom-input').blur();
	n = _n, m = _m;
	grid_type = Array(n);
	for (var i = 0; i < n; i++) {
		grid_type[i] = Array(m);
	}
	army_cnt = Array(n);
	for (var i = 0; i < n; i++) {
		army_cnt[i] = Array(m);
	}
	for (var d = 0; d < 4; d++) {
		have_route[d] = Array(n);
		for (var i = 0; i < n; i++) {
			have_route[d][i] = Array(m);
		}
	}
	route = Array();
	selx = -1, sely = -1;

	var ts = "";
	for (var i = 0; i < n; i++) {
		ts += '<tr>';
		for (var j = 0; j < m; j++) {
			ts += '<td id="t' + i + '_' + j + '"></td>';
		}
		ts += '</tr>';
	}
	$('#map').html('<table><tbody>' + ts + '</table></tbody>');

	if (!general || general[0] == -1) {
		general = [n / 2 - 0.5, m / 2 - 0.5];
	}
	$('#map').css('left', $(document).width() / 2 + (m / 2 - general[1] - 0.5) * scale_sizes[scale] + 'px');
	$('#map').css('top', $(document).height() / 2 + (n / 2 - general[0] - 0.5) * scale_sizes[scale] + 'px');
	for (var i = 0; i < n; i++) {
		for (var j = 0; j < m; j++) {
			$('#t' + i + '_' + j).on('click', Function("click(" + i + "," + j + ")"));
		}
	}
}

function click(x, y, q) {
	if (typeof (q) == "undefined") q = true;
	if (x < 0 || y < 0 || x >= n || y >= m) return;
	if (x == selx && y == sely) {
		if (selt == 1) {
			selt = 2;
		} else {
			selx = sely = -1;
		}
	} else if (Math.abs(x - selx) + Math.abs(y - sely) == 1 && grid_type[x][y] != 201) {
		var d = 0;
		for (; selx + dire[d].x != x || sely + dire[d].y != y; d++);
		addroute(selx, sely, d, selt);
		selx = x, sely = y, selt = 1;
	} else if (grid_type[x][y] < 200 && grid_type[x][y] % 50 == player) {
		selx = x, sely = y, selt = 1;
	} else if (q) {
		selx = -1, sely = -1;
	}
	render();
}

function keypress(key) {
	if (in_game && is_replay) {
		if (key == 'a' || key == 37) {
			backTurn();
		} else if (key == 'd' || key == 39) {
			nextTurn();
		} else if (key == ' ') {
			switchAutoplay();
		}
	}
	else if (in_game) {
		if (key == 'z') {
			selt = 3 - selt;
			render();
		} else if (key == 'w' || key == 38) {
			click(selx - 1, sely, false);
		} else if (key == 's' || key == 40) {
			click(selx + 1, sely, false);
		} else if (key == 'a' || key == 37) {
			click(selx, sely - 1, false);
		} else if (key == 'd' || key == 39) {
			click(selx, sely + 1, false);
		} else if (key == 'q') {
			clear_queue();
		} else if (key == 'e') {
			pop_queue();
		} else if (key == 't') {
			if (!chat_focus) {
				is_team = true;
				setTimeout(function () {
					$('#chatroom-input').focus();
					checkChat();
				}, 0);
			}
		} else if (key == 13) {
			if (!chat_focus) {
				is_team = false;
				setTimeout(function () {
					$('#chatroom-input').focus();
					checkChat();
				}, 0);
			}
		} else if (key == ' ') {
			selx = -1, sely = -1;
			render();
		}
	}
}

$(document).ready(function () {
	$('body').on('keypress', function (e) {
		keypress(e.key.toLowerCase());
	});
	$('body').on('keydown', function (e) {
		keypress(e.keyCode);
	});
	$('#map_back').on('click', function (e) {
		selx = -1, sely = -1;
		render();
	});
	$('body').bind('mousewheel', function (e) {
		if (in_game) {
			if (e.originalEvent.deltaY > 0) {
				scale = Math.max(scale - 1, 1);
			} else {
				scale = Math.min(scale + 1, 6);
			}
			if (typeof (localStorage) != "undefined") {
				localStorage.scale = scale.toString();
			}
			render();
		}
	})
	if (typeof (localStorage) != "undefined") {
		if (typeof (localStorage.scale) == "undefined") {
			localStorage.scale = '3';
		}
		scale = parseInt(localStorage.scale);
	}
});

function render() {
	$('#menu').css('display', 'none');
	$('#game-starting').css('display', 'none');
	$('#game').css('display', '');
	for (var d = 0; d < 4; d++) {
		for (var i = 0; i < n; i++) {
			for (var j = 0; j < m; j++) {
				have_route[d][i][j] = false;
			}
		}
	}
	for (var i = 0; i < route.length; i++) {
		have_route[route[i].d][route[i].x][route[i].y] = true;
	}
	for (var i = 0; i < n; i++) {
		for (var j = 0; j < m; j++) {
			var cls = 's' + scale, txt = '';
			if (grid_type[i][j] < 200) {
				if (grid_type[i][j] < 50) {
					cls += ' c' + grid_type[i][j];
				} else if (grid_type[i][j] < 100) {
					cls += ' c' + (grid_type[i][j] - 50) + ' city';
				} else if (grid_type[i][j] < 150) {
					cls += ' c' + (grid_type[i][j] - 100) + ' general';
				} else if (grid_type[i][j] < 200) {
					cls += ' c' + (grid_type[i][j] - 150) + ' swamp';
				}
				if (grid_type[i][j] % 50 == player) {
					cls += ' selectable';
				}
				if (army_cnt[i][j] || grid_type[i][j] == 50) txt = army_cnt[i][j];
			} else if (grid_type[i][j] == 200) {
				cls += ' empty';
			} else if (grid_type[i][j] == 201) {
				cls += ' mountain empty';
			} else if (grid_type[i][j] == 202) {
				cls += ' fog';
			} else if (grid_type[i][j] == 203) {
				cls += ' obstacle fog';
			} else if (grid_type[i][j] == 204) {
				cls += ' swamp';
			} else if (grid_type[i][j] == 205) {
				cls += ' swamp fog';
			}
			if (i == selx && j == sely) {
				if (selt == 1) {
					cls += ' selected';
				} else {
					cls += ' selected selected50';
					txt = '50%';
				}
			} else if (Math.abs(i - selx) + Math.abs(j - sely) == 1 && grid_type[i][j] != 201) {
				cls += ' attackable';
			}
			if (txt != '' && scale == 1) txt = '<div class="txt">' + txt + '</div>';
			for (var d = 0; d < 4; d++)if (have_route[d][i][j]) {
				if (scale > 1) txt += '<div class="' + dire_class[d] + '">' + dire_char[d] + '</div>';
				else txt += '<div class="' + dire_class[d] + '"><div class="txt">' + dire_char[d] + '</div></div>';
			}
			if ($('#t' + i + '_' + j).attr('class') != cls) {
				$('#t' + i + '_' + j).attr('class', cls);
			}
			if ($('#t' + i + '_' + j).html() != txt) {
				$('#t' + i + '_' + j).html(txt);
			}
		}
	}
}

if (!is_replay) {
	var socket = io.connect(location.origin, { transports: ['websocket', 'polling'] });
} else {
	function socket() { }
	socket.on = function () { }
}

function update(data) {
	if (typeof (data.replay) != "undefined") replay_id = data.replay;
	if (data.is_diff) {
		for (var i = 0; i * 2 < data.grid_type.length; i++) {
			var t = data.grid_type[i * 2];
			grid_type[parseInt(t / m)][t % m] = data.grid_type[i * 2 + 1];
		}
		for (var i = 0; i * 2 < data.army_cnt.length; i++) {
			var t = data.army_cnt[i * 2];
			army_cnt[parseInt(t / m)][t % m] = data.army_cnt[i * 2 + 1];
		}
	} else {
		for (var i = 0, t = 0; i < n; i++) {
			for (var j = 0; j < m; j++) {
				grid_type[i][j] = data.grid_type[t++];
			}
		}
		for (var i = 0, t = 0; i < n; i++) {
			for (var j = 0; j < m; j++) {
				army_cnt[i][j] = data.army_cnt[t++];
			}
		}
	}
	if (route.length) {
		if (data.lst_move.x != -1) {
			while (route.length) {
				var t1 = data.lst_move, t2 = { x: route[0].x, y: route[0].y, dx: route[0].x + dire[route[0].d].x, dy: route[0].y + dire[route[0].d].y, half: route[0].type == 2 };
				route = route.splice(1);
				if (t1.x == t2.x && t1.y == t2.y && t1.dx == t2.dx && t1.dy == t2.dy && t1.half == t2.half) break;
			}
		} else {
			while (route.length) {
				var x = route[0].x, y = route[0].y, dx = route[0].x + dire[route[0].d].x, dy = route[0].y + dire[route[0].d].y;
				if (grid_type[x][y] < 200 && grid_type[x][y] % 50 == player && army_cnt[x][y] > 1 && grid_type[dx][dy] != 201) break;
				route = route.splice(1);
			}
		}
	}
	render();
	lb = data.leaderboard.sort(function (a, b) {
		if (a.army != b.army) return a.army > b.army ? -1 : 1;
		if (a.land != b.land) return a.land > b.land ? -1 : 1;
		if (a.class_ == 'dead') return a.dead > b.dead ? -1 : 1;
		return 0;
	})
	var th = '<tr><td>Team</td><td>Player</td><td>Army</td><td>Land</td></tr>';
	for (var i = 0; i < lb.length; i++) {
		th += '<tr class="' + lb[i].class_ + '"><td>' + lb[i].team + '</td><td class="leaderboard-name c' + lb[i].id + '">' + htmlescape(lb[i].uid) + '</td><td>' + lb[i].army + '</td><td>' + lb[i].land + '</td></tr>';
	}
	$('#game-leaderboard').html(th);
	$('#game-leaderboard').css('display', '');
	$('#turn-counter').html('Turn ' + Math.floor(data.turn / 2) + (data.turn % 2 == 1 ? '.' : ''));
	$('#turn-counter').css('display', '');
	if (is_replay) return;
	if (typeof (data.kills[client_id]) != 'undefined') {
		$($('#status-alert').children()[0].children[0]).html('Game Over');
		$($('#status-alert').children()[0].children[1]).html('<span>You were defeated by <span style="font-family: Quicksand-Bold;">' + htmlescape(data.kills[client_id]) + '</span>.</span>');
		$($('#status-alert').children()[0].children[1]).css('display', '');
		$($('#status-alert').children()[0].children[2]).css('display', '');
		$('#status-alert').css('display', '');
		lost = true;
	}
	if (data.game_end) {
		if ($('#status-alert').css('display') == 'none') {
			if (lost) {
				$($('#status-alert').children()[0].children[0]).html('Game Ended');
			} else {
				$($('#status-alert').children()[0].children[0]).html('You Win');
			}
			$($('#status-alert').children()[0].children[1]).css('display', 'none');
		}
		$('#status-alert').css('display', '');
		$($('#status-alert').children()[0].children[2]).css('display', 'none');
		if (replay_id) $($('#status-alert').children()[0].children[6]).css('display', '');
	}
}

socket.on('update', update);

socket.on('starting', function () {
	$('#menu').css('display', 'none');
	$('#game-starting').css('display', '');
	starting_audio.play();
});

function addroute(x, y, d, type) {
	route.push({ x: x, y: y, d: d, type: type });
	socket.emit('attack', { x: x, y: y, dx: x + dire[d].x, dy: y + dire[d].y, half: type == 2 });
	render();
}

function clear_queue() {
	route = Array()
	socket.emit('clear_queue');
	render();
}

function pop_queue() {
	if (route.length) {
		var tmp = route.pop();
		socket.emit('pop_queue');
		if (tmp.x + dire[tmp.d].x == selx && tmp.y + dire[tmp.d].y == sely) {
			selx = tmp.x, sely = tmp.y;
		}
		render();
	}
}

socket.on('set_id', function (data) {
	client_id = data;
});

socket.on('init_map', function (data) {
	init_map(data.n, data.m, data.general);
	in_game = true;
	lost = false;
	console.log(data);
	for (var i = 0; i < data.player_ids.length; i++) {
		if (data.player_ids[i] == client_id) {
			player = i + 1;
		}
	}
});

function backTurn() {
	if (is_autoplaying) switchAutoplay();
	cur_turn = Math.max(0, cur_turn - 20);
	update(replay_data.history[cur_turn]);
}

function nextTurn(ignore = false) {
	if (is_autoplaying && !ignore) return;
	cur_turn = Math.min(replay_data.history.length - 1, cur_turn + 1);
	update(replay_data.history[cur_turn]);
}

function jumpToTurn() {
	if (is_autoplaying) switchAutoplay();
	var uturn = $('#replay-turn-jump-input').val(), turn = 0;
	if (uturn[uturn.length - 1] == '.') turn = parseInt(uturn.substr(0, uturn.length - 1)) * 2 + 1;
	else turn = parseInt(uturn) * 2;
	for (var i = 0; i < replay_data.history.length; i++) {
		if (replay_data.history[i].turn == turn) {
			cur_turn = i;
			update(replay_data.history[cur_turn]);
			break;
		}
	}
}

function switchAutoplay() {
	is_autoplaying = !is_autoplaying;
	if (!is_autoplaying) {
		$($('#replay-top-left')[0].children[1]).attr('class', 'small');
		$('#tabs-replay-autoplay').css('display', 'none');
		return;
	}
	$($('#replay-top-left')[0].children[1]).attr('class', 'small inverted');
	$('#tabs-replay-autoplay').css('display', 'inline-block');
	setTimeout(autoplay, 500 / autoplay_speed);
}

function autoplay() {
	if (!is_autoplaying) return;
	nextTurn(true);
	setTimeout(autoplay, 500 / autoplay_speed);
}

function setAutoplayRate() {
	var tmp = $($('#tabs-replay-autoplay')[0].children[0]).val();
	autoplay_speed = parseFloat(tmp.substr(0, tmp.length - 1));
}

function _exit() {
	location.href = '/';
}

$(document).ready(function () {
	if (is_replay) {
		$('#replay-top-left').css('display', '');
		$('#replay-bottom').css('display', '');
		$('#replay-turn-jump-input').on('keypress', function (e) {
			if (e.charCode == 10 || e.charCode == 13) jumpToTurn();
		});
		$('#replay-turn-jump-button').on('click', jumpToTurn);
		$($('#replay-bottom-bar')[0].children[0]).on('click', backTurn);
		$($('#replay-bottom-bar')[0].children[1]).on('click', switchAutoplay);
		$($('#replay-bottom-bar')[0].children[2]).on('click', nextTurn);
		$($('#replay-top-left')[0].children[1]).on('click', switchAutoplay);
		$($('#replay-top-left')[0].children[2]).on('click', _exit);
		$('#tabs-replay-autoplay').each(function () {
			for (var i = 1; i < this.children.length; i++) {
				initTab(this, this.children[i], setAutoplayRate);
			}
		});
		replayStart();
		return;
	}
	$('#chat').css('display', '');
	$('#menu').css('display', '');
	if (typeof (localStorage) != "undefined") {
		if (typeof (localStorage.username) == "undefined") {
			localStorage.username = 'Anonymous';
		}
		nickname = localStorage.username;
	} else {
		nickname = 'Anonymous';
	}
	var tmp = location.pathname;
	room_id = tmp.substr(tmp.indexOf('games/') + 6);
	starting_audio = new Audio('/gong.mp3');
	socket.emit('join_game_room', { 'room': room_id, 'nickname': nickname });
});

socket.on('connect', function () {
	if (room_id != '') {
		socket.emit('join_game_room', { 'room': room_id, 'nickname': nickname });
	}
});

socket.on('room_update', function (data) {
	setRangeVal('map-height', data.height_ratio);
	setRangeVal('map-width', data.width_ratio);
	setRangeVal('city-density', data.city_ratio);
	setRangeVal('mountain-density', data.mountain_ratio);
	setRangeVal('swamp-density', data.swamp_ratio);
	setTabVal('game-speed', data.speed + 'x');
	$('#custom-map').val(data.custom_map);
	var tmp = Array(max_teams + 1);
	for (var i = 0; i <= max_teams; i++) {
		tmp[i] = '';
	}
	var isHost = data.players[0].sid == client_id;
	setRangeDisable('map-height', !isHost);
	setRangeDisable('map-width', !isHost);
	setRangeDisable('city-density', !isHost);
	setRangeDisable('mountain-density', !isHost);
	setRangeDisable('swamp-density', !isHost);
	if (isHost) $('#custom-map').removeAttr('disabled');
	else $('#custom-map').attr('disabled', '');
	$('#host-' + (isHost).toString()).css('display', '');
	$('#host-' + (!isHost).toString()).css('display', 'none');
	for (var i = 0; i < data.players.length; i++) {
		if (data.players[i].sid == client_id) {
			setTabVal('custom-team', data.players[i].team ? data.players[i].team.toString() : 'Spectator');
			if (data.players[i].team) {
				$('#you-are').css('display', '');
				$('#you-are-2').css('display', '');
				$($('#you-are')[0].children[1]).attr('class', 'inline-color-block c' + (i + 1));
				$($('#you-are-2')[0].children[1]).attr('class', 'inline-color-block c' + (i + 1));
			} else {
				$('#you-are').css('display', 'none');
				$('#you-are-2').css('display', 'none');
			}
			if (data.players[i].uid == 'Anonymous') {
				$('#username-input').val('');
			} else {
				$('#username-input').val(data.players[i].uid);
			}
		}
		tmp[data.players[i].team] += '<div>';
		if (data.players[i].team) {
			if (i == 0) {
				tmp[data.players[i].team] += '<span class="inline-color-block">' + crown_html + '</span>';
			} else {
				tmp[data.players[i].team] += '<span class="inline-color-block c' + (i + 1) + '"></span>';
			}
		}
		tmp[data.players[i].team] += '<p>';
		if (data.players[i].ready) tmp[data.players[i].team] += '<u>';
		if (i == 0) tmp[data.players[i].team] += '<b>';
		tmp[data.players[i].team] += htmlescape(data.players[i].uid);
		if (i == 0) tmp[data.players[i].team] += '</b>';
		if (data.players[i].ready) tmp[data.players[i].team] += '</u>';
		tmp[data.players[i].team] += '</p>';
		tmp[data.players[i].team] += '</div>';
	}
	for (var i = 0; i <= max_teams; i++) {
		if (tmp[i] != '') {
			tmp[i] = '<div class="custom-team-container"><h4>' + (i ? 'Team ' + i : 'Spectators') + '</h4>' + tmp[i] + '</div>';
		}
	}
	var res_html = '';
	for (var i = 1; i <= max_teams; i++) {
		res_html += tmp[i];
	}
	res_html += tmp[0];
	$('#teams').html(res_html);
	if (data.need > 1) {
		$('#force-start').css('display', 'block');
		$('#force-start').html('Force Start ' + data.ready + ' / ' + data.need);
	} else {
		$('#force-start').css('display', 'none');
	}
	if (ready_state) {
		$('#force-start').attr('class', 'inverted');
	} else {
		$('#force-start').attr('class', '');
	}
});

function getConf() {
	var data = {};
	data.height_ratio = getRangeVal('map-height');
	data.width_ratio = getRangeVal('map-width');
	data.city_ratio = getRangeVal('city-density');
	data.mountain_ratio = getRangeVal('mountain-density');
	data.swamp_ratio = getRangeVal('swamp-density');
	data.speed = parseFloat(getTabVal('game-speed'));
	data.custom_map = $('#custom-map').val();
	return data;
}

function updateConf() {
	socket.emit('change_game_conf', getConf());
}

const delayUpdateConf = _.debounce(updateConf, 300);

function updateTeam() {
	var team = getTabVal('custom-team');
	if (team == 'Spectator') team = 0;
	socket.emit('change_team', { team: team });
}

function getRangeVal(x) {
	return $($('#' + x)[0].children[0]).val();
}

function setRangeVal(x, y) {
	$($('#' + x)[0].children[0]).val(y);
	$($('#' + x)[0].children[1]).html($($('#' + x)[0].children[0]).val());
}

function setRangeDisable(x, y) {
	if (y) $($('#' + x)[0].children[0]).attr('disabled', '');
	else $($('#' + x)[0].children[0]).removeAttr('disabled');
}

function initRange(x) {
	$(x.children[0]).on('change', function () {
		$(x.children[1]).html($(x.children[0]).val())
		delayUpdateConf();
	});
	$(x.children[0]).on('input', function () {
		$(x.children[1]).html($(x.children[0]).val());
		delayUpdateConf();
	});
}

function getTabVal(x) {
	return $($('#tabs-' + x)[0].children[0]).val();
}

function setTabVal(x, y) {
	var tmp = getTabVal(x), tabs = $('#tabs-' + x)[0].children;
	for (var i = 1; i < tabs.length; i++) {
		if ($(tabs[i]).html() == tmp) {
			$(tabs[i]).attr('class', 'inline-button');
		}
		if ($(tabs[i]).html() == y) {
			$(tabs[i]).attr('class', 'inline-button inverted');
		}
	}
	$($('#tabs-' + x)[0].children[0]).val(y);
}

function initTab(x, y, callback) {
	$(y).on('click', function () {
		setTabVal($(x).attr('id').substr(5), $(y).html());
		callback();
	});
}

$(document).ready(function () {
	$('.slider-container').each(function () { initRange(this) });
	$('#tabs-game-speed').each(function () {
		for (var i = 1; i < this.children.length; i++) {
			initTab(this, this.children[i], updateConf);
		}
	});
	$('#tabs-custom-team').each(function () {
		for (var i = 1; i < this.children.length; i++) {
			initTab(this, this.children[i], updateTeam);
		}
	});
	$('#force-start').on('click', function () {
		ready_state ^= 1;
		socket.emit('change_ready', { ready: ready_state });
	});
	function changeUsername() {
		var tmp = $('#username-input').val();
		if (tmp == '') tmp = 'Anonymous';
		socket.emit('change_nickname', { nickname: tmp });
		if (typeof (localStorage) != "undefined") {
			localStorage.username = tmp;
		}
	}
	$('#username-input').on('change', _.debounce(changeUsername, 300));
	$('#username-input').on('input', _.debounce(changeUsername, 300));
	$('#custom-map').on('change', delayUpdateConf);
	$('#custom-map').on('input', delayUpdateConf);
});

var chatStr = '';

function checkChat() {
	var tmp = $('#chatroom-input').val(), res;
	if (is_team) {
		if (tmp.substr(0, 7) == '[team] ') {
			res = tmp.substr(7);
		} else {
			res = chatStr;
		}
	} else {
		if (tmp.substr(0, 7) == '[team] ') {
			res = tmp.substr(7);
		} else {
			res = tmp;
		}
	}
	chatStr = res;
	$('#chatroom-input').val((is_team ? '[team] ' : '') + res);
}

socket.on('left', function () {
	var data = getConf();
	if (typeof (localStorage) != "undefined") {
		if (typeof (localStorage.username) == "undefined") {
			localStorage.username = 'Anonymous';
		}
		nickname = localStorage.username;
	} else {
		nickname = 'Anonymous';
	}
	socket.emit('join_game_room', { 'room': room_id, 'nickname': nickname });
	socket.emit('change_game_conf', data);
	$('#menu').css('display', '');
	$('#game').css('display', 'none');
	$('#game-leaderboard').css('display', 'none');
	$('#turn-counter').css('display', 'none');
	$('#chat-messages-container').html('');
	$('#status-alert').css('display', 'none');
	ready_state = 0;
	in_game = false;
	replay_id = false;
});

$(document).ready(function () {
	var shown = true;
	$('#chat-messages-container').on('click', function () {
		$('#chat-messages-container').attr('class', shown ? 'minimized' : '');
		$('#chatroom-input').attr('class', shown ? 'minimized' : '');
		shown = !shown;
	});
	socket.on('chat_message', function (data) {
		var th = '';
		if (data.color) {
			th = '<span class="inline-color-block c' + data.color + '"></span><span class="username">' + htmlescape(data.sender) + '</span>: ' + htmlescape(data.text) + '</p>';
			if (data.team) {
				th = '<span style="font-family:Quicksand-Bold">[team] </span>' + th;
			}
			th = '<p class="chat-message">' + th;
		} else {
			th = '<p class="chat-message server-chat-message">' + htmlescape(data.text) + '</p>'
		}
		$('#chat-messages-container')[0].innerHTML += th;
		$('#chat-messages-container').scrollTop(233333);
	});
	$('#chatroom-input').on('keypress', function (data) {
		if (data.keyCode == 13) {
			console.log('b');
			socket.emit('send_message', { text: chatStr, team: is_team });
			chatStr = '', is_team = false;
			$('#chatroom-input').val('');
		}
	});
	$('#chatroom-input').focus(function () {
		chat_focus = true;
	});
	$('#chatroom-input').blur(function () {
		chat_focus = false;
		is_team = false;
		checkChat();
	});
	$('#chatroom-input').on('change', checkChat);
	$('#chatroom-input').on('input', checkChat);
	$($('#status-alert').children()[0].children[2]).on('click', function (e) {
		$('#status-alert').css('display', 'none');
	});
	$($('#status-alert').children()[0].children[4]).on('click', function (e) {
		socket.emit('leave');
	});
	$($('#status-alert').children()[0].children[6]).on('click', function (e) {
		window.open('/replays/' + replay_id, '_blank');
	});
	$($('#status-alert').children()[0].children[8]).on('click', _exit);
});
