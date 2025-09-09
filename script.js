// ===============================
// CONFIGURAÇÕES
// ===============================

/** Limite de palavras por linha nas notas.
 *  Ao ultrapassar, o texto é reformatado com quebra automática.
 *  Troque este valor se quiser outro limite.
 */
const LIMITE_PALAVRAS_LINHA = 12;


// ===============================
// UTILITÁRIOS / PERSISTÊNCIA
// ===============================

function gerarId(){ return 'id_' + Math.random().toString(16).slice(2,10); }

function paraYMD(d){
  const z = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`;
}

function somarDias(d, dias){
  const r = new Date(d); r.setDate(r.getDate()+dias); return r;
}

function pegarIntervaloSemana(base){
  const dia = base.getDay();               // 0=dom ... 6=sáb
  const diffSegunda = (dia === 0 ? -6 : 1 - dia);
  const inicio = somarDias(base, diffSegunda);
  const fim = somarDias(inicio, 6);
  return {inicio, fim};
}

function formatarRotuloSemana(inicio, fim){
  const dia2 = new Intl.DateTimeFormat('pt-BR',{day:'2-digit'});
  const mesAbrev = new Intl.DateTimeFormat('pt-BR',{month:'short'}).format(inicio);
  return `${dia2.format(inicio)}–${dia2.format(fim)} ${mesAbrev} ${fim.getFullYear()}`;
}

// -------- Tarefas (LocalStorage)
function carregarTarefas(){
  try{ return JSON.parse(localStorage.getItem('plannerTasksV1')||'[]'); }
  catch(e){ console.warn('Falha ao carregar tarefas', e); return []; }
}
function salvarTarefas(lista){
  localStorage.setItem('plannerTasksV1', JSON.stringify(lista));
}
function filtrarTarefas(lista, termo){
  if(!termo) return [...lista];
  const q = termo.toLowerCase();
  return lista.filter(t => (t.titulo||'').toLowerCase().includes(q) || (t.notas||'').toLowerCase().includes(q));
}

// -------- Blocos de Notas (LocalStorage)
function carregarBlocos(){
  try{ return JSON.parse(localStorage.getItem('plannerNotesV1') || '[]'); }
  catch(e){ console.warn('Falha ao carregar blocos', e); return []; }
}
function salvarBlocos(lista){
  localStorage.setItem('plannerNotesV1', JSON.stringify(lista));
}

// -------- Textarea auto-expansível
function autoResizeTextarea(el){
  el.style.height = 'auto';
  const full = el.scrollHeight;
  const maxH = parseInt(getComputedStyle(el).maxHeight, 10);
  const target = isNaN(maxH) ? full : Math.min(full, maxH);
  el.style.height = target + 'px';
  el.style.overflowY = (full > target) ? 'auto' : 'hidden';
}

// -------- Quebra automática por limite de palavras
/** Re-enviesa o texto para que cada linha tenha no máximo `limite` palavras */
function reflowPorLimitePalavras(texto, limite = LIMITE_PALAVRAS_LINHA){
  // divide por linhas existentes, mas reagrupa respeitando limite
  const palavras = texto.replace(/\s+/g,' ').replace(/\r/g,'').split(' ');
  const linhas = [];
  let atual = [];
  for(const p of palavras){
    if(p === '') continue;
    atual.push(p);
    if(atual.length >= limite){
      linhas.push(atual.join(' '));
      atual = [];
    }
  }
  if(atual.length) linhas.push(atual.join(' '));
  return linhas.join('\n');
}

/** Aplica o reflow no elemento de texto mantendo a sensação de digitação natural */
function aplicarQuebraAutomatica(el){
  const pos = el.selectionStart; // (simples) posição do cursor
  const antes = el.value;
  const apos = reflowPorLimitePalavras(antes);
  if(antes !== apos){
    el.value = apos;
    // tenta manter cursor no fim (comportamento mais natural ao usuário)
    el.selectionStart = el.selectionEnd = Math.min(apos.length, pos + 1);
  }
  autoResizeTextarea(el);
}


// ===============================
// ESTADO GLOBAL
// ===============================

const estado = {
  hoje: new Date(),
  cursor: new Date(),            // data de referência da semana exibida
  tarefas: carregarTarefas(),
  idEditando: null,              // id da tarefa em edição (ou null)
  busca: '',
  blocos: carregarBlocos()       // blocos de notas
};


// ===============================
// RENDERIZAÇÃO: CABEÇALHO / GRADE
// ===============================

function renderizarCabecalhoSemana(){
  const {inicio, fim} = pegarIntervaloSemana(estado.cursor);
  document.getElementById('rotuloSemana').textContent = formatarRotuloSemana(inicio, fim);

  const total = filtrarTarefas(estado.tarefas, estado.busca).filter(t => {
    const d = new Date(t.data);
    return d >= new Date(paraYMD(inicio)) && d <= new Date(paraYMD(fim));
  }).length;
  document.getElementById('estatisticas').textContent = `${total} tarefa${total!==1?'s':''}`;
  document.getElementById('pularData').value = paraYMD(estado.cursor);
}

function renderizarGradeSemana(){
  const grade = document.getElementById('gradeSemana');
  grade.innerHTML = '';
  const {inicio} = pegarIntervaloSemana(estado.cursor);
  const nomes = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

  for(let i=0;i<7;i++){
    const d = somarDias(inicio, i);
    const coluna = document.createElement('div'); coluna.className = 'coluna';

    const h = document.createElement('header');
    const nd = document.createElement('div'); nd.className='nome-dia'; nd.textContent = nomes[d.getDay()];
    const dd = document.createElement('div'); dd.className='data-dia';
    dd.textContent = new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit'}).format(d);
    h.appendChild(nd); h.appendChild(dd);

    const lista = document.createElement('div');
    lista.className = 'lista-solta';
    lista.dataset.data = paraYMD(d);
    lista.addEventListener('dblclick', () => abrirModal({data: paraYMD(d)}));

    coluna.appendChild(h); coluna.appendChild(lista);
    grade.appendChild(coluna);
  }
  renderizarTarefasNosDias();
}

function renderizarTarefasNosDias(){
  document.querySelectorAll('.lista-solta').forEach(el => el.innerHTML = '<div class="vazio">(duplo clique para adicionar)</div>');

  const filtradas = filtrarTarefas(estado.tarefas, estado.busca);

  const porData = {};
  for(const t of filtradas){
    if(!porData[t.data]) porData[t.data] = [];
    porData[t.data].push(t);
  }
  Object.values(porData).forEach(arr => arr.sort((a,b)=>{
    const ah = a.hora? a.hora : '99:99';
    const bh = b.hora? b.hora : '99:99';
    if(ah !== bh) return ah.localeCompare(bh);
    return Number(b.prioridade||1) - Number(a.prioridade||1);
  }));

  document.querySelectorAll('.lista-solta').forEach(lista => {
    const data = lista.dataset.data;
    const itens = porData[data] || [];
    if(itens.length){ lista.innerHTML = '' }
    itens.forEach(t => lista.appendChild(criarCartaoTarefa(t)) );
  });
}

// vencida = não concluída e data/hora < agora
function estaAtrasada(t){
  if(t.concluida || !t.data) return false;
  const dt = new Date(t.data + 'T' + (t.hora || '23:59'));
  return dt < new Date();
}

// cartão de tarefa (sem o botão "⋯")
function criarCartaoTarefa(t){
  const el = document.createElement('div');
  el.className = 'tarefa' + (t.concluida? ' concluida':'' );

  const linha1 = document.createElement('div'); linha1.className = 'linha';
  const esquerda = document.createElement('div'); esquerda.style.display='flex'; esquerda.style.alignItems='center'; esquerda.style.gap='8px';

  const cb = document.createElement('input'); cb.type='checkbox'; cb.checked=!!t.concluida; cb.title='Concluir';
  cb.addEventListener('change', ()=> alternarConcluida(t.id, cb.checked));

  const titulo = document.createElement('div'); titulo.style.fontWeight='600'; titulo.textContent = t.titulo;
  esquerda.appendChild(cb); esquerda.appendChild(titulo);

  const direita = document.createElement('div'); direita.style.display='flex'; direita.style.gap='6px';
  const etiqueta = document.createElement('span'); etiqueta.className='etiqueta prioridade-' + (t.prioridade||1); etiqueta.textContent = ['Baixa','Média','Alta'][(t.prioridade||1)-1];
  direita.appendChild(etiqueta);

  if(estaAtrasada(t)){
    const atrasada = document.createElement('span');
    atrasada.className = 'rotulo-atrasada';
    atrasada.textContent = 'Não atualizado';
    direita.appendChild(atrasada);
  }

  linha1.appendChild(esquerda); linha1.appendChild(direita);

  const linha2 = document.createElement('div'); linha2.className = 'linha';
  const sub = document.createElement('div'); sub.className='suave';
  const partes = [];
  if(t.data) partes.push(new Intl.DateTimeFormat('pt-BR',{weekday:'short', day:'2-digit', month:'2-digit'}).format(new Date(t.data)));
  if(t.hora) partes.push(t.hora);
  sub.textContent = partes.join(' • ');

  const acoes = document.createElement('div'); acoes.style.display='flex'; acoes.style.gap='6px';
  const editar = document.createElement('button'); editar.className='botao destaque'; editar.textContent='Editar'; editar.addEventListener('click', ()=> abrirModal(t));
  const excluir = document.createElement('button'); excluir.className='botao perigo'; excluir.textContent='Excluir'; excluir.addEventListener('click', ()=> excluirTarefa(t.id));
  acoes.appendChild(editar); acoes.appendChild(excluir);

  linha2.appendChild(sub); linha2.appendChild(acoes);

  if(t.notas){
    const notas = document.createElement('div'); notas.className='suave'; notas.textContent = t.notas;
    el.appendChild(linha1); el.appendChild(linha2); el.appendChild(notas);
  }else{
    el.appendChild(linha1); el.appendChild(linha2);
  }
  return el;
}


// ===============================
// CRUD DE TAREFAS
// ===============================

function abrirModal(dados={}){
  estado.idEditando = dados.id || null;
  document.getElementById('tituloModal').textContent = estado.idEditando ? 'Editar tarefa' : 'Nova tarefa';
  document.getElementById('fTitulo').value = dados.titulo || '';
  document.getElementById('fData').value = dados.data || paraYMD(estado.cursor);
  document.getElementById('fHora').value = dados.hora || '';
  document.getElementById('fPrioridade').value = String(dados.prioridade || 1);
  document.getElementById('fNotas').value = dados.notas || '';
  document.getElementById('excluirBotao').style.display = estado.idEditando ? 'inline-block' : 'none';
  document.getElementById('modalTarefa').showModal();
}
function fecharModal(){
  document.getElementById('modalTarefa').close();
  estado.idEditando = null;
}
function lerFormulario(){
  return {
    id: estado.idEditando || gerarId(),
    titulo: document.getElementById('fTitulo').value.trim(),
    data: document.getElementById('fData').value,
    hora: document.getElementById('fHora').value,
    prioridade: Number(document.getElementById('fPrioridade').value),
    notas: document.getElementById('fNotas').value.trim(),
    concluida: estado.idEditando ? (estado.tarefas.find(x=>x.id===estado.idEditando)?.concluida || false) : false
  };
}
function salvarTarefa(){
  const t = lerFormulario();
  if(!t.titulo){ alert('Informe o título.'); return; }
  const idx = estado.tarefas.findIndex(x=>x.id===t.id);
  if(idx>=0) estado.tarefas[idx] = t; else estado.tarefas.push(t);
  salvarTarefas(estado.tarefas);
  fecharModal();
  renderizarTudo();
}
function excluirTarefa(id){
  if(!confirm('Excluir esta tarefa?')) return;
  estado.tarefas = estado.tarefas.filter(t=>t.id!==id);
  salvarTarefas(estado.tarefas);
  renderizarTudo();
  fecharModal();
}
function alternarConcluida(id, valor){
  const t = estado.tarefas.find(t=>t.id===id);
  if(!t) return;
  t.concluida = !!valor;
  salvarTarefas(estado.tarefas);
  renderizarTarefasNosDias();
  renderizarConcluidas();
}


// ===============================
// TAREFAS CONCLUÍDAS (RODAPÉ DO PAINEL)
// ===============================

function renderizarConcluidas(){
  const alvo = document.getElementById('listaConcluidas');
  if(!alvo) return;
  const concluidas = estado.tarefas.filter(t=>t.concluida);

  const cont = document.getElementById('contadorConcluidas');
  if(cont) cont.textContent = String(concluidas.length);

  if(concluidas.length === 0){
    alvo.innerHTML = '<div class="vazio">Nenhuma tarefa concluída ainda.</div>';
    return;
  }
  concluidas.sort((a,b)=>{
    const ad = a.data || '0000-00-00', bd = b.data || '0000-00-00';
    if(ad !== bd) return bd.localeCompare(ad);
    const ah = a.hora || '00:00', bh = b.hora || '00:00';
    return bh.localeCompare(ah);
  });
  alvo.innerHTML = '';
  concluidas.forEach(t => alvo.appendChild(criarCartaoTarefa(t)));
}


// ===============================
// BLOCOS DE NOTAS (ESTILO NOTAS DA APPLE)
// ===============================

let NOTA_CTX = { blocoId:null, notaId:null };

function renderizarBlocos(){
  const wrap = document.getElementById('listaBlocos');
  if(!wrap) return;

  if(estado.blocos.length === 0){
    wrap.innerHTML = `<div class="vazio">Nenhum bloco criado. Clique em <b>+ Novo bloco</b> para começar.</div>`;
    return;
  }

  wrap.innerHTML = '';
  estado.blocos.forEach(bloco => {
    wrap.appendChild(criarCartaoBloco(bloco));
  });
}

function criarCartaoBloco(bloco){
  const el = document.createElement('div');
  el.className = 'bloco';

  // topo: título editável + excluir
  const topo = document.createElement('div');
  topo.className = 'bloco-topo';

  const inputTitulo = document.createElement('input');
  inputTitulo.className = 'titulo-bloco';
  inputTitulo.value = bloco.titulo || 'Novo bloco';
  inputTitulo.placeholder = 'Título do bloco';
  inputTitulo.addEventListener('change', ()=>{
    bloco.titulo = inputTitulo.value.trim() || 'Sem título';
    salvarBlocos(estado.blocos);
  });

  const excluir = document.createElement('button');
  excluir.className = 'botao perigo';
  excluir.textContent = 'Excluir bloco';
  excluir.addEventListener('click', ()=>{
    if(!confirm('Excluir este bloco e todas as notas?')) return;
    estado.blocos = estado.blocos.filter(b=>b.id !== bloco.id);
    salvarBlocos(estado.blocos);
    renderizarBlocos();
  });

  topo.appendChild(inputTitulo);
  topo.appendChild(excluir);

  // nova nota (TEXTAREA auto-expansível + quebra automática por limite de palavras)
  const nova = document.createElement('div');
  nova.className = 'bloco-nova-nota';

  const inputNota = document.createElement('textarea');
  inputNota.className = 'entrada input-nota-textarea';
  inputNota.placeholder = 'Escreva uma nota...';
  inputNota.rows = 1;

  // aplica reflow e auto-resize a cada digitação
  inputNota.addEventListener('input', ()=>{
    aplicarQuebraAutomatica(inputNota);
  });

  const add = document.createElement('button');
  add.className = 'botao destaque';
  add.textContent = 'Adicionar';
  add.addEventListener('click', ()=>{
    const texto = inputNota.value.trim();
    if(!texto) return;
    adicionarNota(bloco.id, texto);
    inputNota.value = '';
    autoResizeTextarea(inputNota);
  });

  // Ctrl/Cmd + Enter adiciona
  inputNota.addEventListener('keydown', (e)=>{
    if(e.key === 'Enter' && (e.ctrlKey || e.metaKey)){
      e.preventDefault(); add.click();
    }
  });

  nova.appendChild(inputNota);
  nova.appendChild(add);

  // lista de notas
  const lista = document.createElement('ul');
  lista.className = 'notas-itens';
  (bloco.itens || []).slice().sort((a,b)=> b.ts - a.ts).forEach(n=>{
    lista.appendChild(criarItemNota(bloco, n));
  });

  el.appendChild(topo);
  el.appendChild(nova);
  el.appendChild(lista);
  return el;
}

function criarItemNota(bloco, nota){
  const li = document.createElement('li');
  li.className = 'item-nota';

  // preview (tipo Notas): 3 linhas, sem repetir título
  const preview = document.createElement('div');
  preview.className = 'preview';
  preview.textContent = nota.texto;
  li.appendChild(preview);

  const meta = document.createElement('div'); meta.className = 'meta';
  const quando = new Intl.DateTimeFormat('pt-BR', { dateStyle:'short', timeStyle:'short' })
                .format(new Date(nota.ts));
  const ladoEsq = document.createElement('span'); ladoEsq.textContent = quando;

  const acoes = document.createElement('div'); acoes.className='item-acoes';
  const remover = document.createElement('button'); remover.className='botao perigo'; remover.textContent='Apagar';
  remover.addEventListener('click', (e)=>{
    e.stopPropagation();
    bloco.itens = (bloco.itens || []).filter(i=>i.id !== nota.id);
    salvarBlocos(estado.blocos);
    renderizarBlocos();
  });
  acoes.appendChild(remover);

  meta.appendChild(ladoEsq); meta.appendChild(acoes);

  li.appendChild(meta);

  // abre modal para leitura/edição
  li.addEventListener('click', ()=>{
    NOTA_CTX = { blocoId: bloco.id, notaId: nota.id };
    document.getElementById('notaTitulo').value = nota.titulo || '';
    document.getElementById('notaTexto').value  = nota.texto || '';
    aplicarQuebraAutomatica(document.getElementById('notaTexto'));
    document.getElementById('modalNota').showModal();
  });

  return li;
}

function criarBloco(titulo='Novo bloco'){
  const novo = { id: 'nb_' + Math.random().toString(16).slice(2,10), titulo, itens: [], createdAt: Date.now() };
  estado.blocos.push(novo);
  salvarBlocos(estado.blocos);
  renderizarBlocos();
}

function adicionarNota(blocoId, texto){
  const bloco = estado.blocos.find(b=>b.id === blocoId);
  if(!bloco) return;
  const item = { id: 'nt_' + Math.random().toString(16).slice(2,10), titulo:'', texto, ts: Date.now() };
  bloco.itens.push(item);
  salvarBlocos(estado.blocos);
  renderizarBlocos();
}


// ===============================
// CONTROLES / UI
// ===============================

function definirBusca(q){ estado.busca = q; renderizarTarefasNosDias(); renderizarCabecalhoSemana(); }
function deslocarSemana(n){ estado.cursor = somarDias(estado.cursor, n*7); renderizarTudo(); }
function irHoje(){ estado.cursor = new Date(); renderizarTudo(); }

function renderizarTudo(){
  renderizarCabecalhoSemana();
  renderizarGradeSemana();
  renderizarConcluidas();
}

// ===============================
// ANIMAÇÃO (opcional: fade-in por letra)
// ===============================
function animarDigitacao(){
  const alvosPadrao = document.querySelectorAll('.cabecalho .titulo strong');
  const alvosExtras  = document.querySelectorAll('.digitavel');
  const alvos = new Set([...alvosPadrao, ...alvosExtras]);

  alvos.forEach((el) => {
    const texto = (el.textContent || '').trim();
    if(!texto) return;
    el.textContent = '';
    const letras = [...texto];
    const atrasoBase = 0.04; // 40ms por letra
    letras.forEach((ch, i) => {
      const span = document.createElement('span');
      span.className = 'digitar-letra';
      span.textContent = ch;
      span.style.animationDelay = `${i * atrasoBase}s`;
      el.appendChild(span);
    });
  });
}

// ===============================
// VÍNCULO DE EVENTOS (UI)
// ===============================

function ligarUI(){
  document.getElementById('semanaAnterior').addEventListener('click', ()=> deslocarSemana(-1));
  document.getElementById('semanaProxima').addEventListener('click', ()=> deslocarSemana(1));
  document.getElementById('hojeBotao').addEventListener('click', irHoje);
  document.getElementById('pularData').addEventListener('change', (e)=>{
    estado.cursor = new Date(e.target.value); renderizarTudo();
  });
  document.getElementById('busca').addEventListener('input', (e)=> definirBusca(e.target.value));
  document.getElementById('novaTarefa').addEventListener('click', ()=> abrirModal({data: paraYMD(estado.cursor)}));

  // Modal tarefa
  document.getElementById('salvarBotao').addEventListener('click', (e)=>{ e.preventDefault(); salvarTarefa(); });
  document.getElementById('excluirBotao').addEventListener('click', ()=>{ if(estado.idEditando) excluirTarefa(estado.idEditando); });
  document.getElementById('fecharModal').addEventListener('click', (e)=>{ e.preventDefault(); fecharModal(); });
  document.getElementById('formTarefa').addEventListener('submit', (e)=>{ e.preventDefault(); salvarTarefa(); });

  // Blocos de notas
  const novoBlocoBtn = document.getElementById('novoBlocoBtn');
  if(novoBlocoBtn){ novoBlocoBtn.addEventListener('click', ()=> criarBloco()); }

  // Modal de nota
  const modalNota = document.getElementById('modalNota');
  if(modalNota){
    document.getElementById('salvarNotaBtn').addEventListener('click', (e)=>{
      e.preventDefault();
      const bloco = estado.blocos.find(b=>b.id === NOTA_CTX.blocoId); if(!bloco) return;
      const nota = (bloco.itens||[]).find(n=>n.id === NOTA_CTX.notaId); if(!nota) return;

      // aplica quebra automática antes de salvar
      const tituloEl = document.getElementById('notaTitulo');
      const textoEl  = document.getElementById('notaTexto');
      aplicarQuebraAutomatica(textoEl);

      nota.titulo = (tituloEl.value || '').trim();
      nota.texto  = textoEl.value;
      nota.ts = Date.now();
      salvarBlocos(estado.blocos);
      modalNota.close();
      renderizarBlocos();
    });
    document.getElementById('apagarNotaBtn').addEventListener('click', ()=>{
      const bloco = estado.blocos.find(b=>b.id === NOTA_CTX.blocoId); if(!bloco) return;
      bloco.itens = (bloco.itens||[]).filter(n=>n.id !== NOTA_CTX.notaId);
      salvarBlocos(estado.blocos);
      modalNota.close();
      renderizarBlocos();
    });
    document.getElementById('fecharModalNota').addEventListener('click', (e)=>{ e.preventDefault(); modalNota.close(); });

    // enquanto digita no modal, aplicar o reflow também
    const notaTexto = document.getElementById('notaTexto');
    if(notaTexto){
      notaTexto.addEventListener('input', ()=> aplicarQuebraAutomatica(notaTexto));
    }
  }
}


// ===============================
// INICIALIZAÇÃO
// ===============================

function iniciar(){
  ligarUI();
  renderizarTudo();
  renderizarBlocos();
  if(typeof animarDigitacao === 'function') animarDigitacao();
}

// start (garante DOM pronto)
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', iniciar);
}else{
  iniciar();
}

