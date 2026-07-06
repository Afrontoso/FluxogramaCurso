import { dadosFluxograma } from './materias.js';

document.addEventListener('DOMContentLoaded', () => {
    const fb = window.firebase;
    const container = document.querySelector('.fluxograma-container');
    let activeLines = [];
    let currentUser = null;
    let userCompletedSubjects = [];
    let userCustomSubjects = {};
    let userPlanos = []; // Semestres planejados pelo usuário
    let allSubjectsData = {}; // Variável para manter os dados combinados

    // --- LÓGICA DO TEMA (CLARO / ESCURO) ---
    const themeToggleBtn = document.getElementById('theme-toggle');

    function aplicarTema(tema) {
        document.documentElement.setAttribute('data-theme', tema);
        localStorage.setItem('tema', tema);
        repositionActiveLines();
    }

    themeToggleBtn.addEventListener('click', () => {
        const temaAtual = document.documentElement.getAttribute('data-theme');
        aplicarTema(temaAtual === 'light' ? 'dark' : 'light');
    });

    // Lê o valor computado de uma variável CSS (para as cores das linhas).
    function corDaVar(nome) {
        return getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
    }

    // --- LÓGICA DE AUTENTICAÇÃO E MODAL ---
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userInfoDiv = document.getElementById('user-info');
    const userNameSpan = document.getElementById('user-name');
    const userPhotoImg = document.getElementById('user-photo'); // Corrigido
    const errorModal = document.getElementById('error-modal');
    const errorMessageP = document.getElementById('error-message');
    const closeModalBtn = document.getElementById('close-modal-btn');

    // --- ELEMENTOS DO PAINEL DE PROGRESSO ---
    const totalProgressSpan = document.getElementById('total-progress');
    const completedProgressSpan = document.getElementById('completed-progress');
    const remainingProgressSpan = document.getElementById('remaining-progress');
    const progressBarFill = document.getElementById('progress-bar-fill');
    const progressPercentSpan = document.getElementById('progress-percent');

    closeModalBtn.addEventListener('click', () => {
        errorModal.style.display = 'none';
    });

    // --- MODAL DE ADICIONAR / EDITAR MATÉRIA ---
    const addMateriaModal = document.getElementById('add-materia-modal');
    const addMateriaForm = document.getElementById('add-materia-form');
    const addMateriaTitle = document.getElementById('add-materia-title');
    const addMateriaSubmit = document.getElementById('add-materia-submit');
    const cancelAddMateriaBtn = document.getElementById('cancel-add-materia');
    const novaNome = document.getElementById('nova-nome');
    const novaCodigo = document.getElementById('nova-codigo');
    const novaSemestre = document.getElementById('nova-semestre');
    const novaCreditos = document.getElementById('nova-creditos');
    const novaNatureza = document.getElementById('nova-natureza');
    const novaPrereqs = document.getElementById('nova-prereqs');
    let editandoId = null;      // id da matéria sendo editada (null = adicionando)
    let semestreOrigem = null;  // semestre atual da matéria em edição

    // Preenche o seletor de semestres a partir da grade.
    Object.keys(dadosFluxograma).forEach(sem => {
        const opt = document.createElement('option');
        opt.value = sem;
        opt.textContent = `${sem}° Semestre`;
        novaSemestre.appendChild(opt);
    });

    function abrirAddMateria(semestre) {
        editandoId = null;
        semestreOrigem = null;
        addMateriaForm.reset();
        addMateriaTitle.textContent = 'Adicionar Matéria';
        addMateriaSubmit.textContent = 'Adicionar';
        novaSemestre.value = semestre;
        novaCreditos.value = 4;
        addMateriaModal.style.display = 'flex';
        novaNome.focus();
    }

    function abrirEditarMateria(materia, semestre) {
        editandoId = materia.id;
        semestreOrigem = semestre;
        addMateriaTitle.textContent = 'Editar Matéria';
        addMateriaSubmit.textContent = 'Salvar';
        novaNome.value = materia.nome;
        novaCodigo.value = materia.codigo === 'OPTATIVA' ? '' : materia.codigo;
        novaSemestre.value = semestre;
        novaCreditos.value = materia.creditos;
        novaNatureza.value = materia.natureza;
        novaPrereqs.value = (materia.prerequisitos || []).join(', ');
        addMateriaModal.style.display = 'flex';
        novaNome.focus();
    }

    function fecharAddMateria() {
        addMateriaModal.style.display = 'none';
        editandoId = null;
        semestreOrigem = null;
    }

    async function excluirMateria(id, semestre) {
        const lista = userCustomSubjects[semestre] || [];
        const materia = lista.find(m => m.id === id);
        if (!materia) return;
        if (!confirm(`Excluir a matéria "${materia.nome}"?`)) return;

        userCustomSubjects[semestre] = lista.filter(m => m.id !== id);
        if (userCustomSubjects[semestre].length === 0) delete userCustomSubjects[semestre];

        const estavaConcluida = userCompletedSubjects.includes(id);
        if (estavaConcluida) userCompletedSubjects = userCompletedSubjects.filter(x => x !== id);

        const userDocRef = fb.doc(fb.db, "users", currentUser.uid);
        const updates = { customSubjects: userCustomSubjects };
        if (estavaConcluida) updates.completed = fb.arrayRemove(id);
        await fb.updateDoc(userDocRef, updates);

        gerarFluxograma(userCompletedSubjects, userCustomSubjects);
    }

    cancelAddMateriaBtn.addEventListener('click', fecharAddMateria);
    addMateriaModal.addEventListener('click', (e) => {
        if (e.target === addMateriaModal) fecharAddMateria();
    });

    addMateriaForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUser) return;

        const nome = novaNome.value.trim();
        const creditos = parseInt(novaCreditos.value, 10);
        const semestreDestino = novaSemestre.value;
        if (!nome || isNaN(creditos) || creditos <= 0 || !semestreDestino) return;

        const dados = {
            nome,
            codigo: novaCodigo.value.trim().toUpperCase() || 'OPTATIVA',
            creditos,
            natureza: novaNatureza.value,
            prerequisitos: novaPrereqs.value
                .split(',')
                .map(s => s.trim().toUpperCase())
                .filter(Boolean)
        };

        if (editandoId) {
            // Remove da posição antiga e reinsere (pode ter mudado de semestre).
            const origem = userCustomSubjects[semestreOrigem] || [];
            const existente = origem.find(m => m.id === editandoId);
            userCustomSubjects[semestreOrigem] = origem.filter(m => m.id !== editandoId);
            if (userCustomSubjects[semestreOrigem].length === 0) delete userCustomSubjects[semestreOrigem];

            if (!userCustomSubjects[semestreDestino]) userCustomSubjects[semestreDestino] = [];
            userCustomSubjects[semestreDestino].push({ ...existente, ...dados, id: editandoId });
        } else {
            if (!userCustomSubjects[semestreDestino]) userCustomSubjects[semestreDestino] = [];
            userCustomSubjects[semestreDestino].push({ id: `custom-${Date.now()}`, ...dados });
        }

        const userDocRef = fb.doc(fb.db, "users", currentUser.uid);
        await fb.updateDoc(userDocRef, { customSubjects: userCustomSubjects });

        fecharAddMateria();
        gerarFluxograma(userCompletedSubjects, userCustomSubjects);
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
            userPlanos = [];
            trocarView('fluxograma');
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
            userPlanos = data.planos || [];
        } else {
            await fb.setDoc(userDocRef, { completed: [], customSubjects: {}, planos: [] });
            userCompletedSubjects = [];
            userCustomSubjects = {};
            userPlanos = [];
        }
        gerarFluxograma(userCompletedSubjects, userCustomSubjects);
    }

    // ======================================================================
    //  PLANEJADOR DE SEMESTRES
    // ======================================================================
    const viewTabs = document.getElementById('view-tabs');
    const viewFluxograma = document.getElementById('view-fluxograma');
    const viewPlanejador = document.getElementById('view-planejador');
    const planosLista = document.getElementById('planos-lista');
    const novoPlanoBtn = document.getElementById('novo-plano-btn');

    const planoModal = document.getElementById('plano-modal');
    const planoForm = document.getElementById('plano-form');
    const planoAno = document.getElementById('plano-ano');
    const planoPeriodo = document.getElementById('plano-periodo');
    const cancelPlanoBtn = document.getElementById('cancel-plano');

    const addPlanoMateriaModal = document.getElementById('add-plano-materia-modal');
    const addPlanoMateriaForm = document.getElementById('add-plano-materia-form');
    const planoMateriaSelect = document.getElementById('plano-materia-select');
    const cancelPlanoMateriaBtn = document.getElementById('cancel-plano-materia');
    let planoAlvoId = null; // plano ao qual estamos adicionando matéria

    const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    // Blocos de horário fixos (aulas de 2 créditos, 1h50 cada)
    const BLOCOS = [
        { inicio: '08:00', fim: '09:50' },
        { inicio: '10:00', fim: '11:50' },
        { inicio: '12:00', fim: '13:50' },
        { inicio: '14:00', fim: '15:50' },
        { inicio: '16:00', fim: '17:50' },
        { inicio: '18:00', fim: '19:50' },
        { inicio: '20:00', fim: '21:50' },
    ];
    const PALETA = ['#3498db', '#9b59b6', '#e67e22', '#16a085', '#e74c3c', '#f39c12', '#2ecc71', '#2980b9', '#c0392b', '#27ae60'];

    function hhmmParaMin(hhmm) {
        const [h, m] = hhmm.split(':').map(Number);
        return h * 60 + m;
    }
    function blocoIndex(a) {
        return BLOCOS.findIndex(b => b.inicio === a.inicio && b.fim === a.fim);
    }

    // Retorna as matérias liberadas: pendentes (não concluídas) e com todos
    // os pré-requisitos já concluídos. Ignora as bloqueadas (cadeado).
    function getMateriasPendentes() {
        const pend = [];
        for (const sem in allSubjectsData) {
            allSubjectsData[sem].forEach(m => {
                const naoConcluida = !userCompletedSubjects.includes(m.id);
                const liberada = (m.prerequisitos || []).every(p => userCompletedSubjects.includes(p));
                if (naoConcluida && liberada) pend.push(m);
            });
        }
        return pend;
    }

    function trocarView(view) {
        const ehPlan = view === 'planejador';
        viewFluxograma.style.display = ehPlan ? 'none' : 'block';
        viewPlanejador.style.display = ehPlan ? 'block' : 'none';
        document.body.classList.toggle('modo-planejador', ehPlan);
        viewTabs.querySelectorAll('.view-tab').forEach(t => {
            t.classList.toggle('ativo', t.dataset.view === view);
        });
        if (ehPlan) renderPlanner();
    }

    viewTabs.addEventListener('click', (e) => {
        const tab = e.target.closest('.view-tab');
        if (tab) trocarView(tab.dataset.view);
    });

    async function salvarPlanos() {
        if (!currentUser) return;
        const ref = fb.doc(fb.db, "users", currentUser.uid);
        await fb.setDoc(ref, { planos: userPlanos }, { merge: true });
    }

    // ---- Novo semestre ----
    novoPlanoBtn.addEventListener('click', () => {
        planoForm.reset();
        planoAno.value = new Date().getFullYear();
        planoModal.style.display = 'flex';
        planoAno.focus();
    });
    cancelPlanoBtn.addEventListener('click', () => { planoModal.style.display = 'none'; });
    planoModal.addEventListener('click', (e) => { if (e.target === planoModal) planoModal.style.display = 'none'; });

    planoForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const ano = parseInt(planoAno.value, 10);
        const periodo = parseInt(planoPeriodo.value, 10);
        if (isNaN(ano)) return;
        userPlanos.push({ id: `plano-${Date.now()}`, ano, periodo, materias: [] });
        userPlanos.sort((a, b) => a.ano - b.ano || a.periodo - b.periodo);
        planoModal.style.display = 'none';
        await salvarPlanos();
        renderPlanner();
    });

    // ---- Adicionar matéria ao plano ----
    cancelPlanoMateriaBtn.addEventListener('click', () => { addPlanoMateriaModal.style.display = 'none'; });
    addPlanoMateriaModal.addEventListener('click', (e) => { if (e.target === addPlanoMateriaModal) addPlanoMateriaModal.style.display = 'none'; });

    function abrirAddPlanoMateria(planoId) {
        const plano = userPlanos.find(p => p.id === planoId);
        if (!plano) return;
        planoAlvoId = planoId;
        const jaNoPlano = new Set(plano.materias.map(m => m.refId));
        const pendentes = getMateriasPendentes().filter(m => !jaNoPlano.has(m.id));
        planoMateriaSelect.innerHTML = pendentes.length
            ? pendentes.map(m => `<option value="${m.id}">${m.nome} (${m.codigo}) — ${m.creditos} CR</option>`).join('')
            : `<option value="">Nenhuma matéria pendente disponível</option>`;
        addPlanoMateriaModal.style.display = 'flex';
    }

    addPlanoMateriaForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const refId = planoMateriaSelect.value;
        const plano = userPlanos.find(p => p.id === planoAlvoId);
        if (!refId || !plano) { addPlanoMateriaModal.style.display = 'none'; return; }

        let materia = null;
        for (const sem in allSubjectsData) {
            const f = allSubjectsData[sem].find(m => m.id === refId);
            if (f) { materia = f; break; }
        }
        if (!materia) return;

        plano.materias.push({
            refId: materia.id,
            nome: materia.nome,
            codigo: materia.codigo,
            creditos: materia.creditos,
            aulas: []
        });
        addPlanoMateriaModal.style.display = 'none';
        await salvarPlanos();
        renderPlanner();
    });

    // ---- Ações dentro dos cards (delegação) ----
    planosLista.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-acao]');
        if (!btn) return;
        const plano = userPlanos.find(p => p.id === btn.dataset.plano);
        if (!plano) return;

        switch (btn.dataset.acao) {
            case 'del-plano':
                if (!confirm(`Excluir o semestre ${plano.ano}/${plano.periodo}?`)) return;
                userPlanos = userPlanos.filter(p => p.id !== plano.id);
                await salvarPlanos();
                renderPlanner();
                break;
            case 'add-materia':
                abrirAddPlanoMateria(plano.id);
                break;
            case 'del-materia':
                plano.materias = plano.materias.filter(m => m.refId !== btn.dataset.mat);
                await salvarPlanos();
                renderPlanner();
                break;
            case 'del-aula': {
                const mat = plano.materias.find(m => m.refId === btn.dataset.mat);
                if (mat) {
                    mat.aulas.splice(parseInt(btn.dataset.idx, 10), 1);
                    await salvarPlanos();
                    renderPlanner();
                }
                break;
            }
        }
    });

    planosLista.addEventListener('submit', async (e) => {
        const form = e.target.closest('.aula-form');
        if (!form) return;
        e.preventDefault();
        const plano = userPlanos.find(p => p.id === form.dataset.plano);
        const mat = plano && plano.materias.find(m => m.refId === form.dataset.mat);
        if (!mat) return;

        const dia = parseInt(form.querySelector('.aula-dia').value, 10);
        const bloco = BLOCOS[parseInt(form.querySelector('.aula-bloco').value, 10)];
        if (!bloco) return;
        // Evita adicionar o mesmo dia+bloco em duplicata para a matéria
        const jaExiste = mat.aulas.some(a => a.dia === dia && a.inicio === bloco.inicio);
        if (!jaExiste) mat.aulas.push({ dia, inicio: bloco.inicio, fim: bloco.fim });
        await salvarPlanos();
        renderPlanner();
    });

    // ---- Detecção de conflitos ----
    function detectarConflitos(plano) {
        const conf = new Set();
        const lista = [];
        plano.materias.forEach(m => m.aulas.forEach((a, idx) => {
            lista.push({ key: `${m.refId}#${idx}`, dia: a.dia, ini: hhmmParaMin(a.inicio), fim: hhmmParaMin(a.fim) });
        }));
        for (let i = 0; i < lista.length; i++) {
            for (let j = i + 1; j < lista.length; j++) {
                if (lista[i].dia === lista[j].dia && lista[i].ini < lista[j].fim && lista[j].ini < lista[i].fim) {
                    conf.add(lista[i].key);
                    conf.add(lista[j].key);
                }
            }
        }
        return conf;
    }

    // ---- Renderização ----
    function renderPlanner() {
        planosLista.innerHTML = '';
        if (userPlanos.length === 0) {
            planosLista.innerHTML = `<div class="planejador-vazio">Nenhum semestre planejado ainda.<br>Clique em "+ Novo semestre" para começar.</div>`;
            return;
        }
        userPlanos.forEach(plano => planosLista.appendChild(renderPlanoCard(plano)));
    }

    function renderPlanoCard(plano) {
        const card = document.createElement('div');
        card.className = 'plano-card';

        const totalCr = plano.materias.reduce((s, m) => s + (m.creditos || 0), 0);
        const corDe = {};
        plano.materias.forEach((m, i) => { corDe[m.refId] = PALETA[i % PALETA.length]; });
        const conflitos = detectarConflitos(plano);

        card.innerHTML = `
            <div class="plano-cabecalho">
                <h3>${plano.ano} · ${plano.periodo}º semestre
                    <span class="plano-meta">${plano.materias.length} matéria(s) · ${totalCr} CR · ${totalCr * 15}h</span>
                </h3>
                <div class="plano-acoes">
                    <button class="plano-del" data-acao="del-plano" data-plano="${plano.id}">Excluir semestre</button>
                </div>
            </div>
            ${conflitos.size > 0 ? `<div class="grade-conflito-aviso">⚠ Há choque de horário entre matérias.</div>` : ''}
            <div class="grade-wrapper">${renderGradeHTML(plano, corDe, conflitos)}</div>
            <div class="plano-materias">${renderMateriasHTML(plano, corDe)}</div>
            <button class="plano-add-materia" data-acao="add-materia" data-plano="${plano.id}">+ Adicionar matéria</button>
        `;
        return card;
    }

    function renderGradeHTML(plano, corDe, conflitos) {
        let html = '<div class="grade">';
        DIAS.forEach((d, i) => {
            html += `<div class="grade-dia" style="grid-column:${i + 2};">${d}</div>`;
        });
        BLOCOS.forEach((b, i) => {
            const row = 2 + i;
            html += `<div class="grade-hora" style="grid-row:${row};">${b.inicio}<small>${b.fim}</small></div>`;
            html += `<div class="grade-linha" style="grid-row:${row}; grid-column:2 / -1;"></div>`;
        });
        plano.materias.forEach(m => {
            m.aulas.forEach((a, idx) => {
                const bi = blocoIndex(a);
                if (bi < 0) return;
                const conf = conflitos.has(`${m.refId}#${idx}`) ? ' conflito' : '';
                html += `<div class="grade-aula${conf}" style="grid-column:${a.dia + 2}; grid-row:${2 + bi}; background:${corDe[m.refId]};" title="${m.nome} (${a.inicio}–${a.fim})"><span class="aula-cod">${m.codigo}</span></div>`;
            });
        });
        html += '</div>';
        return html;
    }

    function renderMateriasHTML(plano, corDe) {
        if (plano.materias.length === 0) {
            return `<div style="color:var(--cor-texto-secundario);font-size:0.9em;">Nenhuma matéria neste semestre ainda.</div>`;
        }
        return plano.materias.map(m => {
            const chips = m.aulas.map((a, idx) =>
                `<span class="aula-chip">${DIAS[a.dia]} ${a.inicio}–${a.fim}<button data-acao="del-aula" data-plano="${plano.id}" data-mat="${m.refId}" data-idx="${idx}" title="Remover">×</button></span>`
            ).join('');
            return `
            <div class="plano-materia">
                <span class="plano-materia-cor" style="background:${corDe[m.refId]}"></span>
                <span class="plano-materia-nome">${m.nome} <small>(${m.codigo} · ${m.creditos} CR)</small></span>
                <button class="plano-materia-del" data-acao="del-materia" data-plano="${plano.id}" data-mat="${m.refId}" title="Remover matéria">🗑</button>
                <div class="aula-chips">${chips || '<span style="color:var(--cor-texto-secundario);font-size:0.8em;">Sem horários</span>'}</div>
                <form class="aula-form" data-plano="${plano.id}" data-mat="${m.refId}">
                    <select class="aula-dia">${DIAS.map((d, i) => `<option value="${i}">${d}</option>`).join('')}</select>
                    <select class="aula-bloco">${BLOCOS.map((b, i) => `<option value="${i}">${b.inicio}–${b.fim}</option>`).join('')}</select>
                    <button type="submit" title="Adicionar horário">+</button>
                </form>
            </div>`;
        }).join('');
    }

    // --- LÓGICA DO PAINEL DE PROGRESSO ---
    function updateProgressPanel() {
        if (!currentUser) {
            totalProgressSpan.innerHTML = "";
            completedProgressSpan.innerHTML = "";
            remainingProgressSpan.innerHTML = "";
            progressPercentSpan.textContent = "";
            progressBarFill.style.width = "0";
            return;
        }

        const HOURS_PER_CREDIT = 15;
        // Metas fixas do currículo (em horas). Ajuste aqui se o currículo mudar.
        const META_OBRIGATORIA_H = 2580; // Obrigatórias + Optativas Obrigatórias
        const META_OPTATIVA_H = 900;     // Optativas
        const META_TOTAL_H = META_OBRIGATORIA_H + META_OPTATIVA_H;

        // Soma as horas concluídas por bucket.
        // Optativa Obrigatória (OPTATORIA) conta junto das optativas.
        let horasObrigatoriaConcluidas = 0;
        let horasOptativaConcluidas = 0;

        userCompletedSubjects.forEach(subjectId => {
            for (const semestre in allSubjectsData) {
                const found = allSubjectsData[semestre].find(m => m.id === subjectId);
                if (found) {
                    const horas = found.creditos * HOURS_PER_CREDIT;
                    if (found.natureza === 'OBRIGATORIO') {
                        horasObrigatoriaConcluidas += horas;
                    } else {
                        horasOptativaConcluidas += horas;
                    }
                    break;
                }
            }
        });

        // Limita cada categoria à sua meta (horas excedentes não inflam o total).
        const obrigConcluidas = Math.min(horasObrigatoriaConcluidas, META_OBRIGATORIA_H);
        const optConcluidas = Math.min(horasOptativaConcluidas, META_OPTATIVA_H);
        const totalConcluido = obrigConcluidas + optConcluidas;
        const faltam = META_TOTAL_H - totalConcluido;
        const percent = Math.round((totalConcluido / META_TOTAL_H) * 100);

        totalProgressSpan.innerHTML = `Obrigatórias: <strong>${obrigConcluidas}h</strong> / ${META_OBRIGATORIA_H}h`;
        completedProgressSpan.innerHTML = `Optativas: <strong>${optConcluidas}h</strong> / ${META_OPTATIVA_H}h`;
        remainingProgressSpan.innerHTML = `Faltam: <strong>${faltam}h</strong>`;
        progressPercentSpan.textContent = `${percent}%`;
        progressBarFill.style.width = `${percent}%`;
    }

    // --- LÓGICA DO FLUXOGRAMA ---
    function removeActiveLines() {
        activeLines.forEach(line => line.remove());
        activeLines = [];
    }

    function gerarFluxograma(completed = [], custom = {}) {
        removeActiveLines();
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
                if (materia.natureza === 'OPTATORIA') card.classList.add('optatoria');

                const isCompleted = completed.includes(materia.id);
                // Bloqueada: usuário logado, não concluída e com algum pré-requisito pendente.
                const prereqsConcluidos = (materia.prerequisitos || []).every(p => completed.includes(p));
                const isLocked = currentUser && !isCompleted && !prereqsConcluidos;
                // Card criado manualmente pelo usuário (permite editar/excluir).
                const isCustom = typeof materia.id === 'string' && materia.id.startsWith('custom-');

                if (isCompleted) card.classList.add('completed');
                if (isLocked) card.classList.add('locked');
                if (isCustom) card.classList.add('is-custom');

                card.dataset.id = materia.id;

                const controle = isLocked
                    ? `<span class="materia-lock" title="Bloqueada — conclua os pré-requisitos"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5zm-3 8V6a3 3 0 0 1 6 0v3H9zm3 5a1.5 1.5 0 0 1 .5 2.915V19a.5.5 0 0 1-1 0v-2.085A1.5 1.5 0 0 1 12 14z"></path></svg></span>`
                    : `<input type="checkbox" class="materia-checkbox" ${isCompleted ? 'checked' : ''} data-materia-id="${materia.id}">`;

                const acoes = isCustom
                    ? `<div class="card-acoes">
                            <button class="card-editar" title="Editar" data-id="${materia.id}" data-semestre="${semestre}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M14.06 9.02l.92.92L5.92 19H5v-.92l9.06-9.06zM17.66 3c-.25 0-.51.1-.7.29l-1.83 1.83 3.75 3.75 1.83-1.83a.996.996 0 0 0 0-1.41l-2.34-2.34c-.2-.2-.45-.29-.71-.29zm-3.6 3.19L3 17.25V21h3.75L17.81 9.94l-3.75-3.75z"></path></svg></button>
                            <button class="card-excluir" title="Excluir" data-id="${materia.id}" data-semestre="${semestre}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM8 9h8v10H8V9zm7.5-5-1-1h-5l-1 1H5v2h14V4h-3.5z"></path></svg></button>
                        </div>`
                    : '';

                card.innerHTML = `
                                ${acoes}
                                <div class="materia-header">
                                    <span class="materia-codigo">${materia.codigo}</span>
                                    <span class="materia-creditos">${materia.creditos} CR</span>
                                </div>
                                <div class="materia-nome">${materia.nome}</div>
                                ${controle}
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
                } else {
                    await fb.updateDoc(userDocRef, { completed: fb.arrayRemove(materiaId) });
                    userCompletedSubjects = userCompletedSubjects.filter(id => id !== materiaId);
                }
                // Re-renderiza para recalcular bloqueios (matérias liberadas/travadas)
                gerarFluxograma(userCompletedSubjects, userCustomSubjects);
            });
        });

        document.querySelectorAll('.add-materia-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                if (!currentUser) return;
                abrirAddMateria(e.currentTarget.dataset.semestre);
            });
        });

        document.querySelectorAll('.card-editar').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!currentUser) return;
                const { id, semestre } = e.currentTarget.dataset;
                const materia = (userCustomSubjects[semestre] || []).find(m => m.id === id);
                if (materia) abrirEditarMateria(materia, semestre);
            });
        });

        document.querySelectorAll('.card-excluir').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!currentUser) return;
                const { id, semestre } = e.currentTarget.dataset;
                excluirMateria(id, semestre);
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
                const line = new LeaderLine(prereqCard, cardSelecionado, { color: corDaVar('--cor-prerequisito'), size: 3, path: 'fluid', dash: { animation: true } });
                activeLines.push(line);
            }
        });

        for (const semestre in allSubjectsData) {
            allSubjectsData[semestre].forEach(materia => {
                if (materia.prerequisitos && materia.prerequisitos.includes(materiaId)) {
                    const materiaLiberadaCard = document.querySelector(`[data-id="${materia.id}"]`);
                    if (materiaLiberadaCard) {
                        materiaLiberadaCard.classList.add('highlight-unlocks');
                        const line = new LeaderLine(cardSelecionado, materiaLiberadaCard, { color: corDaVar('--cor-liberada'), size: 3, path: 'fluid' });
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