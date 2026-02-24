(function(){
	// Elements
	const form = document.getElementById('transaction-form');
	const desc = document.getElementById('desc');
	const amount = document.getElementById('amount');
	const dateInput = document.getElementById('date');
	const type = document.getElementById('type');
	const categoryInput = document.getElementById('category');
	const catColor = document.getElementById('cat-color');
	const list = document.getElementById('transactions-list');
	const balanceEl = document.getElementById('balance');
	const incomeEl = document.getElementById('income');
	const expenseEl = document.getElementById('expense');
	const exportBtn = document.getElementById('export-btn');
	const exportCsvBtn = document.getElementById('export-csv');
	const profileSelect = document.getElementById('profile-select');
	const newProfileBtn = document.getElementById('new-profile');
	const themeToggle = document.getElementById('theme-toggle');
	const goalAmountInput = document.getElementById('goal-amount');
	const setGoalBtn = document.getElementById('set-goal');
	const goalBar = document.getElementById('goal-bar');
	const goalMeta = document.getElementById('goal-meta');
	const topCategoryEl = document.getElementById('top-category');
	const spikeWarningEl = document.getElementById('spike-warning');
	const motivationEl = document.getElementById('motivation');
	const modal = document.getElementById('modal');
	const modalBody = document.getElementById('modal-body');
	const modalClose = modal.querySelector('.modal-close');

	const PROFILES_KEY = 'budget-friendly-profiles';
	const CURRENT_PROFILE_KEY = 'budget-friendly-current-profile';
	const THEME_KEY = 'budget-friendly-theme';

	function generateId(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
	function profileTransactionsKey(pid){ return `budget-friendly:${pid}:transactions`; }
	function profileCategoriesKey(pid){ return `budget-friendly:${pid}:categories`; }
	function profileSettingsKey(pid){ return `budget-friendly:${pid}:settings`; }

	// safe storage helpers
	function safeJsonParse(value, fallback){
		if(!value) return fallback;
		try{ return JSON.parse(value); }catch(e){ console.warn('Corrupt storage for value, resetting to fallback', e); return fallback; }
	}
	function getStored(key, fallback){ return safeJsonParse(localStorage.getItem(key), fallback); }

	// state
	let profiles = getStored(PROFILES_KEY, []);
	let currentProfileId = localStorage.getItem(CURRENT_PROFILE_KEY) || null;
	let transactions = [];
	let categories = [];
	let settings = {monthlyGoal: 0};

	function saveProfiles(){ localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles)); }
	function saveCurrentProfile(){ localStorage.setItem(CURRENT_PROFILE_KEY, currentProfileId); }

	function formatNumber(n){ return 'K' + Number(n).toFixed(2); }
	function escapeHtml(s){ return String(s).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

	// Modal helper
	function showModal(contentHtml, opts = {}){
		modalBody.innerHTML = contentHtml;
		modal.setAttribute('aria-hidden','false');
		// attach optional callbacks
		if(opts.onOpen) opts.onOpen(modal);
		// confirm button handler if provided
		if(opts.onConfirm){
			const confirmBtn = modalBody.querySelector('[data-confirm]');
			if(confirmBtn){ confirmBtn.onclick = ()=>{ opts.onConfirm(); hideModal(); }; }
		}
		// cancel handler
		const cancelBtn = modalBody.querySelector('[data-cancel]');
		if(cancelBtn) cancelBtn.onclick = hideModal;
	}
	function hideModal(){ modal.setAttribute('aria-hidden','true'); modalBody.innerHTML = ''; }
	modalClose.addEventListener('click', hideModal);
	window.addEventListener('keydown', (e)=>{ if(e.key==='Escape') hideModal(); });


	function loadProfile(pid){
		currentProfileId = pid;
		saveCurrentProfile();
		transactions = getStored(profileTransactionsKey(pid), []);
		categories = getStored(profileCategoriesKey(pid), []);
		settings = getStored(profileSettingsKey(pid), {monthlyGoal:0});
		renderProfiles(); render(); applyThemeFromStorage();
	}

	function createProfile(name){
		name = String(name||'').trim(); if(!name) return;
		const id = generateId();
		profiles.push({id, name});
		saveProfiles();
		localStorage.setItem(profileTransactionsKey(id), JSON.stringify([]));
		localStorage.setItem(profileCategoriesKey(id), JSON.stringify([]));
		localStorage.setItem(profileSettingsKey(id), JSON.stringify({monthlyGoal:0}));
		loadProfile(id);
	}

	function renderProfiles(){
		profileSelect.innerHTML = '';
		profiles.forEach(p => { const opt = document.createElement('option'); opt.value = p.id; opt.textContent = p.name; profileSelect.appendChild(opt); });
		if(currentProfileId) profileSelect.value = currentProfileId;
	}

	function saveProfileData(){ if(!currentProfileId) return; localStorage.setItem(profileTransactionsKey(currentProfileId), JSON.stringify(transactions)); localStorage.setItem(profileCategoriesKey(currentProfileId), JSON.stringify(categories)); localStorage.setItem(profileSettingsKey(currentProfileId), JSON.stringify(settings)); }

	function addCategoryIfMissing(name, color){ name = String(name||'').trim(); if(!name) return; const exist = categories.find(c=>c.name.toLowerCase()===name.toLowerCase()); if(!exist){ categories.push({id: generateId(), name, color}); saveProfileData(); } }

	function render(){
		list.innerHTML = '';
		if(transactions.length===0) list.innerHTML = '<li class="empty">No transactions yet</li>';
		transactions.slice().reverse().forEach(t=>{
			const li = document.createElement('li'); li.className = 'transaction ' + t.type;
			const cat = t.category ? `<span class="category-chip" style="background:${t.color||'#666'}">${escapeHtml(t.category)}</span>` : '';
			li.innerHTML = `<div class="desc">${cat}<strong>${escapeHtml(t.description)}</strong><div class="muted">${t.date||''}</div></div><div class="right"><span class="amount">${t.type==='expense'?'-':''}${formatNumber(t.amount)}</span><button class="edit" data-id="${t.id}" aria-label="Edit transaction">✎</button><button class="del" data-id="${t.id}" aria-label="Delete transaction">✕</button></div>`;
			list.appendChild(li);
		});
		updateSummary(); renderInsights(); renderGoal();
	}

	// edit state
	let editingId = null;

	function updateSummary(){ const incomes = transactions.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0); const expenses = transactions.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0); const bal = incomes - expenses; incomeEl.textContent = formatNumber(incomes); expenseEl.textContent = formatNumber(expenses); balanceEl.textContent = formatNumber(bal); }

	// delegated actions: edit and delete
	list.addEventListener('click', (e)=>{
		const delBtn = e.target.closest('.del');
		if(delBtn){
			const id = delBtn.getAttribute('data-id');
			showModal(`<p>Delete this transaction?</p><div style="margin-top:12px"><button data-confirm class="btn">Delete</button> <button data-cancel class="btn secondary">Cancel</button></div>`, { onConfirm: ()=>{ const idx = transactions.findIndex(t=>t.id===id); if(idx >= 0) { transactions.splice(idx, 1); saveProfileData(); render(); } } });
			return;
		}
		const editBtn = e.target.closest('.edit');
		if(editBtn){
			const id = editBtn.getAttribute('data-id');
			const tx = transactions.find(t=>t.id===id); if(!tx) return;
			editingId = id;
			desc.value = tx.description; amount.value = tx.amount; dateInput.value = tx.date || new Date().toISOString().slice(0,10); type.value = tx.type || 'expense'; categoryInput.value = tx.category || ''; catColor.value = tx.color || '#2563eb';
			const submitBtn = form.querySelector('button[type="submit"]'); if(submitBtn) submitBtn.textContent = 'Save';
			window.scrollTo({top:0,behavior:'smooth'});
			return;
		}
	});

	function renderInsights(){
		const expenses = transactions.filter(t=>t.type==='expense'); const byCat = {}; expenses.forEach(e=>{ const k = e.category||'Uncategorized'; byCat[k] = (byCat[k]||0) + Number(e.amount); }); const entries = Object.entries(byCat).sort((a,b)=>b[1]-a[1]); topCategoryEl.textContent = entries.length? `Top category: ${entries[0][0]} (${formatNumber(entries[0][1])})` : 'Top category: —';
		const today = new Date().toISOString().slice(0,10); const daily = {}; expenses.forEach(e=>{ const d = (e.date||'').slice(0,10); if(!d) return; daily[d] = (daily[d]||0) + Number(e.amount); }); const days = Object.keys(daily).length || 1; const total = Object.values(daily).reduce((s,v)=>s+v,0); const avg = total / days; const todayAmt = daily[today] || 0; if(avg>0 && todayAmt > avg * 3){ spikeWarningEl.textContent = `Spike detected: today's spending ${formatNumber(todayAmt)} is unusually high.`; } else { spikeWarningEl.textContent = ''; }
		const monthTotal = transactions.filter(t=>t.type==='expense' && (t.date||'').slice(0,7) === (new Date().toISOString().slice(0,7))).reduce((s,t)=>s+Number(t.amount),0); if(settings.monthlyGoal && monthTotal <= settings.monthlyGoal){ motivationEl.textContent = `Great job — you're ${formatNumber(settings.monthlyGoal - monthTotal)} under your goal this month.`; } else if(settings.monthlyGoal){ motivationEl.textContent = `You've exceeded your monthly goal by ${formatNumber(monthTotal - settings.monthlyGoal)}.`; } else { motivationEl.textContent = ''; }
	}

	function renderGoal(){ const goal = Number(settings.monthlyGoal)||0; if(!goal){ goalMeta.textContent = 'No goal set'; goalBar.style.width = '0%'; goalBar.parentElement.setAttribute('aria-valuenow',0); return; } const monthTotal = transactions.filter(t=>t.type==='expense' && (t.date||'').slice(0,7) === (new Date().toISOString().slice(0,7))).reduce((s,t)=>s+Number(t.amount),0); const pct = Math.min(100, Math.round( (monthTotal / goal) * 100 )); goalBar.style.width = pct + '%'; goalBar.parentElement.setAttribute('aria-valuenow', pct); goalMeta.textContent = `${formatNumber(monthTotal)} of ${formatNumber(goal)} (${pct}%)`; if(pct >= 90 && pct < 100) spikeWarningEl.textContent = 'Alert: You are close to your monthly budget!'; if(pct >= 100) spikeWarningEl.textContent = 'Alert: You have exceeded your monthly budget.'; }

	// improved validation and submission with edit support
	form.addEventListener('submit', e=>{
		e.preventDefault();
		if(!currentProfileId){ showModal('<p>Please create or select a profile first.</p><div style="margin-top:12px"><button data-cancel class="btn">OK</button></div>'); return; }
		const d = desc.value.trim(); const a = parseFloat(amount.value); const dt = dateInput.value || new Date().toISOString().slice(0,10); const t = type.value; const cat = categoryInput.value.trim(); const color = catColor.value;
		if(!d){ showModal('<p>Please enter a description.</p><div style="margin-top:12px"><button data-cancel class="btn">OK</button></div>'); return; }
		if(isNaN(a) || !isFinite(a)){ showModal('<p>Please enter a valid amount.</p><div style="margin-top:12px"><button data-cancel class="btn">OK</button></div>'); return; }
		if(a === 0){ showModal('<p>Amount cannot be zero.</p><div style="margin-top:12px"><button data-cancel class="btn">OK</button></div>'); return; }
		const amt = Math.abs(a);
		if(editingId){
			// update existing
			const idx = transactions.findIndex(ti=>ti.id === editingId);
			if(idx !== -1){ transactions[idx].description = d; transactions[idx].amount = amt; transactions[idx].date = dt; transactions[idx].type = t; transactions[idx].category = cat || null; transactions[idx].color = cat?color:null; saveProfileData(); }
			editingId = null;
			const submitBtn = form.querySelector('button[type="submit"]'); if(submitBtn) submitBtn.textContent = 'Add';
			form.reset(); render();
		} else {
			const tx = { id: generateId(), description: d, amount: amt, type: t, date: dt, category: cat || null, color: cat?color:null };
			transactions.push(tx); if(cat) addCategoryIfMissing(cat,color); saveProfileData(); form.reset(); render();
		}
	});

	exportBtn.addEventListener('click', ()=>{ const report = document.getElementById('report'); const opt = { margin: 0.5, filename: `${profiles.find(p=>p.id===currentProfileId)?.name||'budget'}-report.pdf`, image: {type: 'jpeg', quality: 0.98}, html2canvas: {scale: 2}, jsPDF: {unit: 'in', format: 'letter', orientation: 'portrait'} }; html2pdf().set(opt).from(report).save(); });

	exportCsvBtn.addEventListener('click', ()=>{ if(!currentProfileId) { showModal('<p>Select a profile first.</p><div style="margin-top:12px"><button data-cancel class="btn">OK</button></div>'); return; } const rows = [['Date','Type','Description','Category','Amount']]; transactions.forEach(t => rows.push([t.date||'', t.type, t.description, t.category||'', t.amount])); const csv = rows.map(r => r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n'); const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${profiles.find(p=>p.id===currentProfileId)?.name||'budget'}-transactions.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); });

	profileSelect.addEventListener('change', ()=>{ if(profileSelect.value) loadProfile(profileSelect.value); });
	newProfileBtn.addEventListener('click', ()=>{
		showModal('<label>Profile name<br><input id="new-profile-name" type="text" placeholder="e.g. Personal"></label><div style="margin-top:12px"><button data-confirm class="btn">Create</button> <button data-cancel class="btn secondary">Cancel</button></div>', { onOpen(modalEl){ const input = modalEl.querySelector('#new-profile-name'); if(input){ input.focus(); } }, onConfirm(){ const input = modalBody.querySelector('#new-profile-name'); const name = input && input.value.trim(); if(!name){ showModal('<p>Profile name cannot be empty.</p><div style="margin-top:12px"><button data-cancel class="btn">OK</button></div>'); return; } createProfile(name); } });
	});

	setGoalBtn.addEventListener('click', ()=>{ const g = Number(goalAmountInput.value)||0; settings.monthlyGoal = g; saveProfileData(); renderGoal(); });

	themeToggle.addEventListener('click', ()=>{ const dark = document.body.classList.toggle('dark'); localStorage.setItem(THEME_KEY, dark? 'dark':'light'); });

	function applyThemeFromStorage(){ const t = localStorage.getItem(THEME_KEY) || 'light'; if(t==='dark') document.body.classList.add('dark'); else document.body.classList.remove('dark'); }

	// initial setup
	if(!Array.isArray(profiles) || profiles.length === 0){ createProfile('Personal'); }
	if(!currentProfileId && profiles[0]) loadProfile(profiles[0].id);
	renderProfiles(); applyThemeFromStorage();

	// onboarding: show a short welcome once (non-blocking modal)
	if(!localStorage.getItem('budget-friendly-onboarded')){
		showModal('<h3>Welcome to Budget Friendly!</h3><p>Create profiles, add transactions with categories and dates, set a monthly goal, and export PDF/CSV reports.</p><div style="margin-top:12px"><button data-confirm class="btn">Got it</button></div>', {});
		localStorage.setItem('budget-friendly-onboarded','1');
	}

})();