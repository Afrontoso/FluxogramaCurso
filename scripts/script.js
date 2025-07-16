document.addEventListener('DOMContentLoaded', () => {
    const fb = window.firebase;
    const container = document.querySelector('.fluxograma-container');
    let activeLines = [];
    let currentUser = null;
    let userCompletedSubjects = [];
    let userCustomSubjects = {};
    let allSubjectsData = {}; // Variável para manter os dados combinados

    // --- LÓGICA DE AUTENTICAÇÃO E MODAL ---
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userInfoDiv = document.getElementById('user-info');
    const userNameSpan = document.getElementById('user-name');
    const userPhotoImg = document.getElementById('user-photo');
    const errorModal = document.getElementById('error-modal');
    const errorMessageP = document.getElementById('error-message');
    const closeModalBtn = document.getElementById('close-modal-btn');

    // --- ELEMENTOS DO PAINEL DE PROGRESSO ---
    const totalProgressSpan = document.getElementById('total-progress');
    const completedProgressSpan = document.getElementById('completed-progress');
    const remainingProgressSpan = document.getElementById('remaining-progress');

    closeModalBtn.addEventListener('click', () => {
        errorModal.style.display = 'none';
    });

    loginBtn.addEventListener('click', async () => {
        const provider = new fb.GoogleAuthProvider();
        try {
            await fb.signInWithPopup(fb.auth, provider);
        } catch (error) {
            if (error.code === 'auth/unauthorized-domain') {
                errorMessageP.innerHTML = `O domínio deste site não está autorizado no seu projeto Firebase.<br><br><strong>Ação Necessária:</strong><br>1. Acesse o Console do Firebase.<br>2. Vá para Authentication -> Settings -> Authorized domains.<br>3. Adicione o domínio: <strong>${window.location.hostname}</strong>`;
                errorModal.style.display = 'flex';
            } else {
                console.error("Erro ao fazer login com Google:", error);
                errorMessageP.textContent = `Ocorreu um erro inesperado ao tentar fazer login: ${error.message}`;
                errorModal.style.display = 'flex';
            }
        }
    });

    logoutBtn.addEventListener('click', async () => {
        try {
            await fb.signOut(fb.auth);
        } catch (error) {
            console.error("Erro ao fazer logout:", error);
        }
    });

    fb.onAuthStateChanged(fb.auth, async (user) => {
        if (user) {
            currentUser = user;
            document.body.classList.remove('logged-out');
            userInfoDiv.style.display = 'flex';
            loginBtn.style.display = 'none';
            userNameSpan.textContent = user.displayName;
            userPhotoImg.src = user.photoURL;
            await loadUserData(user.uid);
        } else {
            currentUser = null;
            document.body.classList.add('logged-out');
            userInfoDiv.style.display = 'none';
            loginBtn.style.display = 'block';
            userCompletedSubjects = [];
            userCustomSubjects = {};
            gerarFluxograma();
            updateProgressPanel(); // Limpa o painel
        }
    });

    async function loadUserData(userId) {
        const userDocRef = fb.doc(fb.db, "users", userId);
        const docSnap = await fb.getDoc(userDocRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            userCompletedSubjects = data.completed || [];
            userCustomSubjects = data.customSubjects || {};
        } else {
            await fb.setDoc(userDocRef, { completed: [], customSubjects: {} });
            userCompletedSubjects = [];
            userCustomSubjects = {};
        }
        gerarFluxograma(userCompletedSubjects, userCustomSubjects);
    }

    // --- LÓGICA DO PAINEL DE PROGRESSO ---
    function updateProgressPanel() {
        if (!currentUser) {
            totalProgressSpan.innerHTML = "";
            completedProgressSpan.innerHTML = "";
            remainingProgressSpan.innerHTML = "";
            return;
        }

        const HOURS_PER_CREDIT = 15;
        let totalCredits = 0;
        let completedCredits = 0;

        // Calcula o total de créditos
        for (const semestre in allSubjectsData) {
            allSubjectsData[semestre].forEach(materia => {
                totalCredits += materia.creditos;
            });
        }

        // Calcula os créditos concluídos
        userCompletedSubjects.forEach(subjectId => {
            for (const semestre in allSubjectsData) {
                const found = allSubjectsData[semestre].find(m => m.id === subjectId);
                if (found) {
                    completedCredits += found.creditos;
                    break;
                }
            }
        });

        const remainingCredits = totalCredits - completedCredits;

        totalProgressSpan.innerHTML = `Total: <strong>${totalCredits} CR</strong> (${totalCredits * HOURS_PER_CREDIT}h)`;
        completedProgressSpan.innerHTML = `Concluído: <strong>${completedCredits} CR</strong> (${completedCredits * HOURS_PER_CREDIT}h)`;
        remainingProgressSpan.innerHTML = `Restante: <strong>${remainingCredits} CR</strong> (${remainingCredits * HOURS_PER_CREDIT}h)`;
    }

    // --- LÓGICA DO FLUXOGRAMA ---
    function removeActiveLines() {
        activeLines.forEach(line => line.remove());
        activeLines = [];
    }

    function gerarFluxograma(completed = [], custom = {}) {
        container.innerHTML = '';
        allSubjectsData = JSON.parse(JSON.stringify(dadosFluxograma));

        for (const semestre in custom) {
            if (allSubjectsData[semestre]) {
                allSubjectsData[semestre].push(...custom[semestre]);
            }
        }

        for (const semestre in allSubjectsData) {
            const coluna = document.createElement('div');
            coluna.className = 'semestre-coluna';
            coluna.id = `semestre_${semestre}`;

            const semestreHeader = document.createElement('div');
            semestreHeader.className = 'semestre-header';
            semestreHeader.innerHTML = `<h3>${semestre}° Semestre</h3><button class="add-materia-btn" data-semestre="${semestre}"><svg xmlns="http://www.w3.org/2000/svg" width="26" height="26"><path d="M13 0A13 13 0 0 0 0 13a13 13 0 0 0 13 13 13 13 0 0 0 13-13A13 13 0 0 0 13 0zm0 6c3.86 0 7 3.14 7 7s-3.14 7-7 7-7-3.14-7-7 3.14-7 7-7zm0 1a5.994 5.994 0 0 0-6.002 6c0 3.32 2.682 6 6.002 6s6-2.68 6-6-2.68-6-6-6zm-.014 2.004v.002a.5.5 0 0 1 .51.506l.004 2.992 2.992-.01a.5.5 0 1 1 .002 1l-2.992.01.004 2.996a.5.5 0 1 1-1 0l-.006-2.994-2.994.01a.501.501 0 0 1-.002-1.002l2.996-.01-.006-2.992a.5.5 0 0 1 .492-.508z"></path></svg></button>`;
            coluna.appendChild(semestreHeader);

            allSubjectsData[semestre].forEach(materia => {
                const card = document.createElement('div');
                card.className = 'materia-card';
                if (materia.natureza === 'OBRIGATORIO') card.classList.add('obrigatoria');
                if (materia.natureza === 'OPTATIVA') card.classList.add('custom');
                if (completed.includes(materia.id)) card.classList.add('completed');

                card.dataset.id = materia.id;

                card.innerHTML = `
                            <div class="materia-header">
                                <span class="materia-codigo">${materia.codigo}</span>
                                <span class="materia-creditos">${materia.creditos} CR</span>
                            </div>
                            <div class="materia-nome">${materia.nome}</div>
                            <input type="checkbox" class="materia-checkbox" ${completed.includes(materia.id) ? 'checked' : ''} data-materia-id="${materia.id}">
                        `;

                card.addEventListener('click', (e) => {
                    if (e.target.type !== 'checkbox') {
                        onMateriaClick(materia.id);
                    }
                });
                coluna.appendChild(card);
            });
            container.appendChild(coluna);
        }

        setupEventListeners();
        updateProgressPanel();
    }

    function setupEventListeners() {
        document.querySelectorAll('.materia-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', async (e) => {
                if (!currentUser) return;
                const materiaId = e.target.dataset.materiaId;
                const userDocRef = fb.doc(fb.db, "users", currentUser.uid);

                if (e.target.checked) {
                    await fb.updateDoc(userDocRef, { completed: fb.arrayUnion(materiaId) });
                    userCompletedSubjects.push(materiaId);
                    document.querySelector(`[data-id="${materiaId}"]`).classList.add('completed');
                } else {
                    await fb.updateDoc(userDocRef, { completed: fb.arrayRemove(materiaId) });
                    userCompletedSubjects = userCompletedSubjects.filter(id => id !== materiaId);
                    document.querySelector(`[data-id="${materiaId}"]`).classList.remove('completed');
                }
                updateProgressPanel(); // Atualiza o painel após a mudança
            });
        });

        document.querySelectorAll('.add-materia-btn').forEach(button => {
            button.addEventListener('click', async (e) => {
                if (!currentUser) return;
                const semestre = e.currentTarget.dataset.semestre;

                const nome = prompt("Nome da matéria:");
                if (!nome) return;

                const creditos = parseInt(prompt("Número de créditos:"), 10);
                if (isNaN(creditos) || creditos <= 0) {
                    alert("Por favor, insira um número de créditos válido.");
                    return;
                }

                const newMateria = {
                    id: `custom-${Date.now()}`,
                    nome,
                    codigo: 'OPTATIVA',
                    creditos,
                    natureza: 'OPTATIVA',
                    prerequisitos: []
                };

                if (!userCustomSubjects[semestre]) {
                    userCustomSubjects[semestre] = [];
                }
                userCustomSubjects[semestre].push(newMateria);

                const userDocRef = fb.doc(fb.db, "users", currentUser.uid);
                await fb.updateDoc(userDocRef, {
                    customSubjects: userCustomSubjects
                });

                gerarFluxograma(userCompletedSubjects, userCustomSubjects);
            });
        });
    }

    function onMateriaClick(materiaId) {
        const cardSelecionado = document.querySelector(`[data-id="${materiaId}"]`);

        if (cardSelecionado.classList.contains('highlight-selected')) {
            removeActiveLines();
            document.querySelectorAll('.materia-card').forEach(card => card.classList.remove('highlight-selected', 'highlight-prerequisite', 'highlight-unlocks'));
            return;
        }

        removeActiveLines();

        let materiaSelecionada;
        for (const semestre in allSubjectsData) {
            const encontrada = allSubjectsData[semestre].find(m => m.id === materiaId);
            if (encontrada) {
                materiaSelecionada = encontrada;
                break;
            }
        }

        if (!materiaSelecionada) return;

        document.querySelectorAll('.materia-card').forEach(card => card.classList.remove('highlight-selected', 'highlight-prerequisite', 'highlight-unlocks'));

        cardSelecionado.classList.add('highlight-selected');

        materiaSelecionada.prerequisitos.forEach(prereqId => {
            const prereqCard = document.querySelector(`[data-id="${prereqId}"]`);
            if (prereqCard) {
                prereqCard.classList.add('highlight-prerequisite');
                const line = new LeaderLine(prereqCard, cardSelecionado, { color: 'var(--cor-prerequisito)', size: 3, path: 'fluid', dash: { animation: true } });
                activeLines.push(line);
            }
        });

        for (const semestre in allSubjectsData) {
            allSubjectsData[semestre].forEach(materia => {
                if (materia.prerequisitos && materia.prerequisitos.includes(materiaId)) {
                    const materiaLiberadaCard = document.querySelector(`[data-id="${materia.id}"]`);
                    if (materiaLiberadaCard) {
                        materiaLiberadaCard.classList.add('highlight-unlocks');
                        const line = new LeaderLine(cardSelecionado, materiaLiberadaCard, { color: 'var(--cor-liberada)', size: 3, path: 'fluid' });
                        activeLines.push(line);
                    }
                }
            });
        }
    }

    gerarFluxograma();
    updateProgressPanel();

    function repositionActiveLines() {
        activeLines.forEach(line => line.position());
    }

    // Adiciona um listener para o evento de scroll no container do fluxograma
    container.addEventListener('scroll', repositionActiveLines, { passive: true });

    // Adiciona um listener para o evento de redimensionamento da janela
    window.addEventListener('resize', repositionActiveLines);
});