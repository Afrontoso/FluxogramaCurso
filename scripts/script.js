document.addEventListener('DOMContentLoaded', () => {
    const container = document.querySelector('.fluxograma-container');
    let activeLines = []; // Array para guardar as linhas ativas

    // Função para remover todas as linhas ativas
    function removeActiveLines() {
        activeLines.forEach(line => line.remove());
        activeLines = [];
    }

    function gerarFluxograma() {
        container.innerHTML = '';

        for (const semestre in dadosFluxograma) {
            const coluna = document.createElement('div');
            coluna.className = 'semestre-coluna';
            coluna.id = `semestre_${semestre}`;
            coluna.innerHTML = `<h3>${semestre}° Semestre</h3>`;

            dadosFluxograma[semestre].forEach(materia => {
                const card = document.createElement('div');
                card.className = 'materia-card';
                if (materia.natureza === 'OBRIGATORIO') {
                    card.classList.add('obrigatoria');
                }
                card.dataset.id = materia.id;

                card.innerHTML = `
                            <div class="materia-header">
                                <span class="materia-codigo">${materia.codigo}</span>
                                <span class="materia-creditos">${materia.creditos} CR</span>
                            </div>
                            <div class="materia-nome">${materia.nome}</div>
                        `;

                card.addEventListener('click', () => onMateriaClick(materia.id));
                coluna.appendChild(card);
            });
            container.appendChild(coluna);
        }
    }

    function onMateriaClick(materiaId) {
        const cardSelecionado = document.querySelector(`[data-id="${materiaId}"]`);

        if (cardSelecionado.classList.contains('highlight-selected')) {
            removeActiveLines();
            document.querySelectorAll('.materia-card').forEach(card => {
                card.classList.remove('highlight-selected', 'highlight-prerequisite', 'highlight-unlocks');
            });
            return;
        }

        removeActiveLines();

        let materiaSelecionada;
        for (const semestre in dadosFluxograma) {
            const encontrada = dadosFluxograma[semestre].find(m => m.id === materiaId);
            if (encontrada) {
                materiaSelecionada = encontrada;
                break;
            }
        }

        if (!materiaSelecionada) return;

        document.querySelectorAll('.materia-card').forEach(card => {
            card.classList.remove('highlight-selected', 'highlight-prerequisite', 'highlight-unlocks');
        });

        cardSelecionado.classList.add('highlight-selected');

        materiaSelecionada.prerequisitos.forEach(prereqId => {
            const prereqCard = document.querySelector(`[data-id="${prereqId}"]`);
            if (prereqCard) {
                prereqCard.classList.add('highlight-prerequisite');
                const line = new LeaderLine(prereqCard, cardSelecionado, {
                    color: 'var(--cor-prerequisito)',
                    size: 3,
                    path: 'fluid',
                    dash: { animation: true }
                });
                activeLines.push(line);
            }
        });

        for (const semestre in dadosFluxograma) {
            dadosFluxograma[semestre].forEach(materia => {
                if (materia.prerequisitos && materia.prerequisitos.includes(materiaId)) {
                    const materiaLiberadaCard = document.querySelector(`[data-id="${materia.id}"]`);
                    if (materiaLiberadaCard) {
                        materiaLiberadaCard.classList.add('highlight-unlocks');
                        const line = new LeaderLine(cardSelecionado, materiaLiberadaCard, {
                            color: 'var(--cor-liberada)',
                            size: 3,
                            path: 'fluid'
                        });
                        activeLines.push(line);
                    }
                }
            });
        }
    }

    gerarFluxograma();

    function repositionActiveLines() {
        activeLines.forEach(line => line.position());
    }

    // Adiciona um listener para o evento de scroll no container do fluxograma
    container.addEventListener('scroll', repositionActiveLines, { passive: true });

    // Adiciona um listener para o evento de redimensionamento da janela
    window.addEventListener('resize', repositionActiveLines);
});