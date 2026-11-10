document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    socket.on('error', (data) => {
        alert(data.message || 'Виникла помилка авторизації.');
        if (data.message && data.message.includes('адміністратор')) {
            window.location.href = '/login';
        }
    });
    
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
        const roundStatus = document.getElementById('roundStatus');
        const buzzAudio = document.getElementById('buzzAudio');
        const soundOptions = JSON.parse(buzzAudio.dataset.soundOptions);
        let timerInterval = null;

        const setRoundStatus = (text, color) => {
            if (!roundStatus) return;
            roundStatus.className = `badge rounded-pill text-bg-${color} px-3 py-2`;
            roundStatus.innerText = text;
        };

        connectBoardBtn.addEventListener('click', () => {
            const roomCode = boardRoomInput.value.trim().toUpperCase();
            if (!roomCode) return;
            const asPlayer = document.getElementById('connectAsPlayer');
            if (asPlayer && asPlayer.checked) {
                window.location.href = `/join?room_code=${encodeURIComponent(roomCode)}`;
                return;
            }
            socket.emit('join_room_request', { room_code: roomCode, role: 'board' });
            document.getElementById('boardRoomSelect').classList.add('d-none');
            mainBoardContainer.classList.remove('d-none');
            document.getElementById('displayRoomCode').innerText = roomCode;
        });

        socket.on('players_updated', (players) => {
            if (playerCount) playerCount.innerText = players.length;
            if (playerList) {
                playerList.innerHTML = players.length
                    ? players.map(p =>
                        `<li class="list-group-item bg-transparent border-secondary py-3">${p.name}</li>`
                    ).join('')
                    : '<li class="list-group-item bg-transparent text-secondary py-4 text-center">Очікуємо на гравців...</li>';
            }
        });

        socket.on('round_started', (data) => {
            winnerBanner.classList.add('d-none');
            setRoundStatus('Раунд триває', 'success');
            let timeLeft = data.duration;
            if (timerDisplay) timerDisplay.innerText = timeLeft;
            
            clearInterval(timerInterval);
            timerInterval = setInterval(() => {
                timeLeft--;
                if (timerDisplay) timerDisplay.innerText = timeLeft;
                if (timeLeft <= 0) {
                    clearInterval(timerInterval);
                    setRoundStatus('Час вичерпано', 'secondary');
                }
            }, 1000);
        });

        socket.on('round_continued', (data) => {
            winnerBanner.classList.add('d-none');
            setRoundStatus('Раунд продовжено', 'success');
            let timeLeft = data.remaining;
            if (timerDisplay) timerDisplay.innerText = timeLeft;

            clearInterval(timerInterval);
            timerInterval = setInterval(() => {
                timeLeft--;
                if (timerDisplay) timerDisplay.innerText = timeLeft;
                if (timeLeft <= 0) {
                    clearInterval(timerInterval);
                    setRoundStatus('Час вичерпано', 'secondary');
                }
            }, 1000);
        });

        socket.on('button_pressed_first', (data) => {
            clearInterval(timerInterval);
            setRoundStatus('Раунд завершено', 'warning');
            if (winnerName) winnerName.innerText = data.winner;
            winnerBanner.classList.remove('d-none');
            if (buzzAudio) buzzAudio.play().catch(e => console.log('Autoplay error:', e));
        });

        socket.on('sound_selected', (data) => {
            const sound = soundOptions[data.sound_id];
            if (!sound || !buzzAudio) return;
            buzzAudio.src = sound.url;
            buzzAudio.load();
        });

        socket.on('round_reset', () => {
            clearInterval(timerInterval);
            if (timerDisplay) timerDisplay.innerText = "00";
            winnerBanner.classList.add('d-none');
            setRoundStatus('Очікуємо старту', 'secondary');
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
        const continueBtn = document.getElementById('continueBtn');
        const resetBtn = document.getElementById('resetBtn');
        const durationInput = document.getElementById('durationInput');
        const roundCountdown = document.getElementById('roundCountdown');
        const soundRadios = document.querySelectorAll('.game-sound-option');
        const soundPreview = document.getElementById('soundPreview');
        const soundSelectionStatus = document.getElementById('soundSelectionStatus');

        let currentRoomCode = currentRoomCodeDisplay ? currentRoomCodeDisplay.innerText.trim() : "";
        let adminTimerInterval = null;
        const checkedSound = document.querySelector('.game-sound-option:checked');
        let selectedSoundId = checkedSound ? checkedSound.value : "";

        const selectAdminSound = (soundId) => {
            const radio = Array.from(soundRadios).find((option) => option.value === soundId);
            if (!radio) return;

            radio.checked = true;
            selectedSoundId = soundId;
            if (soundPreview) {
                soundPreview.src = radio.dataset.soundUrl;
                soundPreview.load();
            }
        };

        const saveAdminSound = () => {
            if (!currentRoomCode || !selectedSoundId) {
                if (soundSelectionStatus) {
                    soundSelectionStatus.innerText = 'Вибір буде застосовано після створення кімнати.';
                }
                return;
            }
            socket.emit('admin_set_sound', {
                room_code: currentRoomCode,
                sound_id: selectedSoundId,
            });
        };

        soundRadios.forEach((radio) => {
            radio.addEventListener('change', () => {
                if (!radio.checked) return;
                selectAdminSound(radio.value);
                saveAdminSound();
            });
        });

        const setAdminControls = (roundActive, roundStarted) => {
            if (startBtn) startBtn.disabled = roundActive;
            if (continueBtn) continueBtn.disabled = !roundStarted;
            if (resetBtn) resetBtn.disabled = !roundStarted;
        };

        const startAdminCountdown = (duration) => {
            clearInterval(adminTimerInterval);
            let timeLeft = Math.max(0, Math.ceil(Number(duration) || 0));
            if (roundCountdown) roundCountdown.innerText = String(timeLeft).padStart(2, '0');
            if (timeLeft <= 0) {
                setAdminControls(false, true);
                if (continueBtn) continueBtn.disabled = true;
                return;
            }

            adminTimerInterval = setInterval(() => {
                timeLeft--;
                if (roundCountdown) roundCountdown.innerText = String(timeLeft).padStart(2, '0');
                if (timeLeft <= 0) {
                    clearInterval(adminTimerInterval);
                    setAdminControls(false, true);
                    if (continueBtn) continueBtn.disabled = true;
                }
            }, 1000);
        };

        setAdminControls(false, false);

        if (currentRoomCode) {
            socket.on('connect', () => {
                socket.emit('join_room_request', { room_code: currentRoomCode, role: 'admin' });
            });
        }

        socket.on('admin_state', (state) => {
            setAdminControls(state.round_active, state.has_started);
            selectAdminSound(state.sound_id);
            if (state.has_started) {
                startAdminCountdown(state.remaining);
                if (state.round_active) {
                    if (continueBtn) continueBtn.disabled = false;
                } else if (state.remaining <= 0 && continueBtn) {
                    continueBtn.disabled = true;
                }
            } else {
                clearInterval(adminTimerInterval);
                if (roundCountdown) roundCountdown.innerText = '00';
            }
        });

        createGameBtn.addEventListener('click', () => {
            socket.emit('admin_create_game');
        });

        socket.on('game_created', (data) => {
            currentRoomCode = data.room_code;
            currentRoomCodeDisplay.innerText = currentRoomCode;
            window.history.replaceState({}, '', `/admin/${encodeURIComponent(currentRoomCode)}`);
            createGameBtn.classList.add('d-none');
            adminControls.classList.remove('d-none');
            setAdminControls(false, false);
            saveAdminSound();
        });

        socket.on('sound_selected', (data) => {
            selectAdminSound(data.sound_id);
            if (soundSelectionStatus) {
                soundSelectionStatus.innerText = 'Вибраний звук застосовано до цієї кімнати.';
            }
        });

        socket.on('round_started', (data) => {
            setAdminControls(true, true);
            startAdminCountdown(data.duration);
        });

        socket.on('round_continued', (data) => {
            setAdminControls(true, true);
            startAdminCountdown(data.remaining);
        });

        socket.on('button_pressed_first', () => {
            setAdminControls(false, true);
        });

        socket.on('round_reset', () => {
            clearInterval(adminTimerInterval);
            if (roundCountdown) roundCountdown.innerText = '00';
            setAdminControls(false, false);
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
                const duration = durationInput ? durationInput.value : 30;
                socket.emit('admin_start', { room_code: currentRoomCode, duration: duration });
            });
        }

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