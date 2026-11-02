document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // ==========================================
    // 1. ГОЛОВНЕ ТАБЛО (index.html)
    // ==========================================
    const mainBoardContainer = document.getElementById('mainBoardContainer');

    if (mainBoardContainer) {
        const boardRoomInput = document.getElementById('boardRoomInput');
        const connectBoardBtn = document.getElementById('connectBoardBtn');

        const playerList = document.getElementById('playerList');
        const playerCount = document.getElementById('playerCount');
        const winnerBanner = document.getElementById('winnerBanner');
        const winnerName = document.getElementById('winnerName');
        const timerDisplay = document.getElementById('timerDisplay');
        const buzzAudio = document.getElementById('buzzAudio');
        let timerInterval = null;

        connectBoardBtn.addEventListener('click', () => {
            const roomCode = boardRoomInput.value.trim().toUpperCase();
            if (!roomCode) return;
            const asPlayer = document.getElementById('connectAsPlayer');
            if (asPlayer && asPlayer.checked) {
                window.location.href = `/join?room_code=${encodeURIComponent(roomCode)}`;
                return;
            }
            {
                socket.emit('join_room_request', { room_code: roomCode, role: 'board' });
                document.getElementById('boardRoomSelect').classList.add('d-none');
                mainBoardContainer.classList.remove('d-none');
                document.getElementById('displayRoomCode').innerText = roomCode;
            }
        });

        socket.on('players_updated', (players) => {
            if (playerCount) playerCount.innerText = players.length;
            if (playerList) {
                playerList.innerHTML = players.map(p => 
                    `<li class="list-group-item bg-dark text-white border-secondary">${p.name}</li>`
                ).join('');
            }
        });

        socket.on('round_started', (data) => {
            winnerBanner.classList.add('d-none');
            let timeLeft = data.duration;
            if (timerDisplay) timerDisplay.innerText = timeLeft;
            
            clearInterval(timerInterval);
            timerInterval = setInterval(() => {
                timeLeft--;
                if (timerDisplay) timerDisplay.innerText = timeLeft;
                if (timeLeft <= 0) clearInterval(timerInterval);
            }, 1000);
        });

        socket.on('round_continued', (data) => {
            winnerBanner.classList.add('d-none');
            let timeLeft = data.remaining;
            if (timerDisplay) timerDisplay.innerText = timeLeft;

            clearInterval(timerInterval);
            timerInterval = setInterval(() => {
                timeLeft--;
                if (timerDisplay) timerDisplay.innerText = timeLeft;
                if (timeLeft <= 0) clearInterval(timerInterval);
            }, 1000);
        });

        socket.on('button_pressed_first', (data) => {
            clearInterval(timerInterval);
            if (winnerName) winnerName.innerText = data.winner;
            winnerBanner.classList.remove('d-none');
            if (buzzAudio) buzzAudio.play().catch(e => console.log('Autoplay error:', e));
        });

        socket.on('round_reset', () => {
            clearInterval(timerInterval);
            if (timerDisplay) timerDisplay.innerText = "00";
            winnerBanner.classList.add('d-none');
        });
    }

    // ==========================================
    // 2. СТОРІНКА ГРАВЦЯ (game.html)
    // ==========================================
    const mainButton = document.getElementById('mainButton');
    const playerNameEl = document.getElementById('playerName');
    const roomCodeEl = document.getElementById('roomCode');

    if (mainButton && playerNameEl && roomCodeEl) {
        const statusAlert = document.getElementById('statusAlert');
        const playerName = playerNameEl.innerText.trim();
        const roomCode = roomCodeEl.innerText.trim();

        socket.on('connect', () => {
            socket.emit('join_room_request', { 
                room_code: roomCode, 
                name: playerName, 
                role: 'player' 
            });
        });

        socket.on('round_started', () => {
            mainButton.disabled = false;
            if (statusAlert) {
                statusAlert.className = "alert alert-success fs-4 fw-bold";
                statusAlert.innerText = "РАУНД РОЗПОЧАТО! ТИСНИ!";
            }
        });

        socket.on('round_continued', (data) => {
            if (data.excluded.includes(playerName)) {
                mainButton.disabled = true;
                if (statusAlert) {
                    statusAlert.className = "alert alert-secondary fs-4";
                    statusAlert.innerText = "Ви вже натискали в цьому раунді. Чекайте...";
                }
            } else {
                mainButton.disabled = false;
                if (statusAlert) {
                    statusAlert.className = "alert alert-success fs-4 fw-bold";
                    statusAlert.innerText = "ПРОДОВЖЕННЯ! ТИСНИ!";
                }
            }
        });

        socket.on('button_pressed_first', (data) => {
            mainButton.disabled = true;
            if (statusAlert) {
                if (data.winner === playerName) {
                    statusAlert.className = "alert alert-warning fs-4 fw-bold";
                    statusAlert.innerText = "ВИ НАТИСНУЛИ ПЕРШИМ!";
                } else {
                    statusAlert.className = "alert alert-danger fs-4";
                    statusAlert.innerText = `Першим натиснув: ${data.winner}`;
                }
            }
        });

        socket.on('round_reset', () => {
            mainButton.disabled = true;
            if (statusAlert) {
                statusAlert.className = "alert alert-secondary fs-4";
                statusAlert.innerText = "Очікування старту раунду...";
            }
        });

        socket.on('kicked', () => {
            alert("Вас було вилучено з гри.");
            window.location.href = "/join";
        });

        mainButton.addEventListener('click', () => {
            if (!mainButton.disabled) {
                socket.emit('press_button', { room_code: roomCode });
                mainButton.disabled = true;
            }
        });
    }

    // ==========================================
    // 3. ПАНЕЛЬ АДМІНІСТРАТОРА (admin.html)
    // ==========================================
    const createGameBtn = document.getElementById('createGameBtn');

    if (createGameBtn) {
        const adminControls = document.getElementById('adminControls');
        const currentRoomCodeDisplay = document.getElementById('currentRoomCode');
        const adminPlayerList = document.getElementById('adminPlayerList');
        const startBtn = document.getElementById('startBtn');
        const resetBtn = document.getElementById('resetBtn');

        let currentRoomCode = "";

        createGameBtn.addEventListener('click', () => {
            socket.emit('admin_create_game');
        });

        socket.on('game_created', (data) => {
            currentRoomCode = data.room_code;
            currentRoomCodeDisplay.innerText = currentRoomCode;
            createGameBtn.classList.add('d-none');
            adminControls.classList.remove('d-none');
        });

        socket.on('players_updated', (players) => {
            if (adminPlayerList) {
                adminPlayerList.innerHTML = players.map(p => `
                    <li class="list-group-item bg-dark text-white border-secondary d-flex justify-content-between align-items-center">
                        ${p.name}
                        <button class="btn btn-danger btn-sm btn-kick" data-sid="${p.sid}">Вилучити</button>
                    </li>
                `).join('');
            }
        });

        if (startBtn) {
            startBtn.addEventListener('click', () => {
                const durationInput = document.getElementById('durationInput');
                const duration = durationInput ? durationInput.value : 30;
                socket.emit('admin_start', { room_code: currentRoomCode, duration: duration });
            });
        }

        const continueBtn = document.getElementById('continueBtn');
        if (continueBtn) {
            continueBtn.addEventListener('click', () => {
                socket.emit('admin_continue', { room_code: currentRoomCode });
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                socket.emit('admin_reset', { room_code: currentRoomCode });
            });
        }

        if (adminPlayerList) {
            adminPlayerList.addEventListener('click', (e) => {
                if (e.target && e.target.classList.contains('btn-kick')) {
                    const sid = e.target.getAttribute('data-sid');
                    if (sid) {
                        socket.emit('admin_kick', { room_code: currentRoomCode, sid: sid });
                    }
                }
            });
        }
    }
});