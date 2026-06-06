// ui.ts — Multivariate cryptography lab UI.
import { keygen, sign, verify, hashMessage, evalMap, type UovKeys, type SignTrace } from './uov.ts';
import { SCHEMES, BEULLENS_STORY, SIG_COMPARE, type MvScheme } from './data.ts';

function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	className?: string,
	html?: string,
): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	if (className) node.className = className;
	if (html !== undefined) node.innerHTML = html;
	return node;
}

const hex = (b: number) => b.toString(16).padStart(2, '0').toUpperCase();
const hexArr = (a: number[]) => a.map(hex).join(' ');

function statusChip(s: 'broken' | 'research' | 'historical' | 'standardized'): string {
	const map: Record<string, [string, string]> = {
		broken: ['scenario-status--invalid', 'Broken'],
		research: ['scenario-status--pending', 'Research'],
		historical: ['scenario-status--pending', 'Historical'],
		standardized: ['scenario-status--valid', 'Standardized'],
	};
	const [cls, label] = map[s];
	return `<span class="maturity-chip ${cls}">${label}</span>`;
}

function renderHero(): HTMLElement {
	const hero = el('header', 'hero-panel');
	hero.innerHTML = `
    <button id="theme-toggle" class="theme-toggle" type="button" aria-label="Switch theme">\u{1F319}</button>
    <div class="hero-copy">
      <a class="portfolio-badge" href="https://github.com/systemslibrarian?tab=repositories&q=crypto-lab">crypto-lab \u00b7 portfolio</a>
      <p class="eyebrow">Post-Quantum \u00b7 Multivariate</p>
      <h1>Oil &amp; Vinegar</h1>
      <p class="hero-text">
        Multivariate cryptography builds signatures on the hardness of solving systems of
        quadratic equations. This lab runs a real, working Unbalanced Oil-and-Vinegar (UOV)
        scheme over GF(256) in your browser \u2014 sign a message, watch the trapdoor turn a
        hard nonlinear problem into an easy linear one, then see why Rainbow, the layered
        version, was broken on a laptop in 2022.
      </p>
      <details class="why-details">
        <summary>Why study a broken family?</summary>
        <p>
          Multivariate schemes produce the shortest signatures of any post-quantum family, yet
          their trapdoors keep falling to structural attacks. Understanding exactly how Rainbow
          broke is the clearest way to see why NIST chose less-structured lattice assumptions for
          its primary standards.
        </p>
      </details>
    </div>
    <div class="hero-metric-card">
      <p class="hero-metric-label">The MQ problem</p>
      <p class="hero-metric-value">Solve:<br/>p\u2081(x) = y\u2081<br/>p\u2082(x) = y\u2082<br/>\u2026 over GF(256)</p>
      <p class="hero-metric-note">NP-hard in general \u00b7 easy if you know the trapdoor</p>
    </div>
  `;
	return hero;
}

// --- Live UOV playground ---------------------------------------------------
function renderPlayground(): HTMLElement {
	const section = el('section', 'lab-section');
	section.setAttribute('aria-labelledby', 'playground-heading');
	section.innerHTML = `
    <div class="section-heading-row">
      <div>
        <p class="section-kicker">Live demo</p>
        <h2 id="playground-heading">Sign with the Trapdoor</h2>
        <p class="section-footnote">
          A real UOV scheme with ${'\u0076'} vinegar and o oil variables over GF(256). Keys, signing,
          and verification all run client-side. Teaching parameters \u2014 not production-secure.
        </p>
      </div>
    </div>

    <div class="playground-grid">
      <div class="panel-card panel-card--wide">
        <h3>1 \u00b7 Message</h3>
        <textarea id="msg" class="message-input" rows="2">For the glory of God \u2014 1 Cor 10:31</textarea>
        <div class="param-row">
          <label>Vinegar (v): <select id="vsel"><option>4</option><option selected>6</option><option>8</option></select></label>
          <label>Oil (o): <select id="osel"><option selected>3</option><option>4</option></select></label>
          <button id="keygen-btn" class="ghost-button" type="button">Generate keypair</button>
        </div>
        <p id="key-status" class="panel-copy">No keypair yet \u2014 generate one to begin.</p>
      </div>

      <div class="panel-card">
        <h3>2 \u00b7 Message hash (target)</h3>
        <p class="panel-copy">The message hashes to an o-byte target the signature must hit.</p>
        <div id="target-out" class="mono-block">\u2014</div>
      </div>

      <div class="panel-card">
        <h3>3 \u00b7 Sign</h3>
        <p class="panel-copy">Guess vinegar \u2192 the system goes linear in oil \u2192 solve.</p>
        <button id="sign-btn" class="action-button" type="button" disabled>Sign message</button>
        <div id="trace-out" class="trace-out"></div>
      </div>

      <div class="panel-card panel-card--wide">
        <h3>4 \u00b7 Verify</h3>
        <div class="scenario-grid">
          <div class="scenario-card">
            <h3>Valid signature</h3>
            <button id="verify-ok" class="ghost-button" type="button" disabled>Verify as-is</button>
            <p id="verify-ok-status" class="scenario-status scenario-status--pending">Awaiting signature</p>
          </div>
          <div class="scenario-card">
            <h3>Tampered signature</h3>
            <button id="verify-bad" class="ghost-button" type="button" disabled>Flip one byte &amp; verify</button>
            <p id="verify-bad-status" class="scenario-status scenario-status--pending">Awaiting signature</p>
          </div>
          <div class="scenario-card">
            <h3>Tampered message</h3>
            <button id="verify-msg" class="ghost-button" type="button" disabled>Change message &amp; verify</button>
            <p id="verify-msg-status" class="scenario-status scenario-status--pending">Awaiting signature</p>
          </div>
        </div>
      </div>
    </div>
  `;

	let keys: UovKeys | null = null;
	let trace: SignTrace | null = null;
	let target: number[] = [];

	const $ = (id: string) => section.querySelector('#' + id) as HTMLElement;
	const msg = $('msg') as HTMLTextAreaElement;
	const vsel = $('vsel') as HTMLSelectElement;
	const osel = $('osel') as HTMLSelectElement;
	const signBtn = $('sign-btn') as HTMLButtonElement;
	const okBtn = $('verify-ok') as HTMLButtonElement;
	const badBtn = $('verify-bad') as HTMLButtonElement;
	const msgBtn = $('verify-msg') as HTMLButtonElement;

	function refreshTarget(): void {
		if (!keys) return;
		target = hashMessage(msg.value, keys.params.o);
		$('target-out').textContent = hexArr(target);
	}

	function doKeygen(): void {
		const v = parseInt(vsel.value, 10);
		const o = parseInt(osel.value, 10);
		keys = keygen({ v, o });
		trace = null;
		$('key-status').innerHTML = `Keypair ready \u00b7 n = ${v + o} variables \u00b7 public map = ${o} quadratics in ${v + o} vars. <strong>Public key hides which variables are oil.</strong>`;
		refreshTarget();
		signBtn.disabled = false;
		[okBtn, badBtn, msgBtn].forEach((b) => (b.disabled = true));
		$('trace-out').innerHTML = '';
		['verify-ok-status', 'verify-bad-status', 'verify-msg-status'].forEach((id) => {
			$(id).className = 'scenario-status scenario-status--pending';
			$(id).textContent = 'Awaiting signature';
		});
	}

	function doSign(): void {
		if (!keys) return;
		refreshTarget();
		trace = sign(keys, target);
		$('trace-out').innerHTML = `
      <div class="trace-step"><span class="trace-label">Vinegar guess</span><span class="mono-inline">${hexArr(trace.vinegar)}</span></div>
      <div class="trace-step"><span class="trace-label">Solved oil</span><span class="mono-inline">${hexArr(trace.oil)}</span></div>
      <div class="trace-step"><span class="trace-label">Signature</span><span class="mono-inline">${hexArr(trace.signature)}</span></div>
      <p class="section-footnote">Found a solvable system after ${trace.attempts} vinegar guess${trace.attempts === 1 ? '' : 'es'}. Signing is fast because fixing vinegar makes the equations linear.</p>`;
		[okBtn, badBtn, msgBtn].forEach((b) => (b.disabled = false));
	}

	function setStatus(id: string, ok: boolean, text: string): void {
		const node = $(id);
		node.className = `scenario-status ${ok ? 'scenario-status--valid' : 'scenario-status--invalid'}`;
		node.textContent = text;
	}

	$('keygen-btn').addEventListener('click', doKeygen);
	signBtn.addEventListener('click', doSign);
	msg.addEventListener('input', () => {
		if (keys) refreshTarget();
	});

	okBtn.addEventListener('click', () => {
		if (!keys || !trace) return;
		const ok = verify(keys, target, trace.signature);
		setStatus('verify-ok-status', ok, ok ? '\u2713 Valid \u2014 P(signature) = target' : '\u2717 Rejected');
	});
	badBtn.addEventListener('click', () => {
		if (!keys || !trace) return;
		const bad = trace.signature.slice();
		bad[0] = (bad[0] ^ 0x01) & 0xff;
		const ok = verify(keys, target, bad);
		setStatus('verify-bad-status', ok, ok ? 'Valid (unexpected!)' : '\u2717 Rejected \u2014 one flipped byte breaks it');
	});
	msgBtn.addEventListener('click', () => {
		if (!keys || !trace) return;
		const otherTarget = hashMessage(msg.value + ' (edited)', keys.params.o);
		const ok = verify(keys, otherTarget, trace.signature);
		setStatus('verify-msg-status', ok, ok ? 'Valid (unexpected!)' : '\u2717 Rejected \u2014 signature is bound to the message');
	});

	// auto-run once so the page is alive on load
	queueMicrotask(() => {
		doKeygen();
	});

	return section;
}

// --- Beullens attack walkthrough -------------------------------------------
function renderAttack(): HTMLElement {
	const section = el('section', 'lab-section');
	const steps = BEULLENS_STORY.map(
		(s, i) => `
    <div class="attack-step">
      <div class="attack-num">${i + 1}</div>
      <div>
        <h3>${s.title}</h3>
        <p class="panel-copy">${s.body}</p>
      </div>
    </div>`,
	).join('');
	section.innerHTML = `
    <div class="section-heading-row">
      <div>
        <p class="section-kicker">The break</p>
        <h2>How Rainbow Fell</h2>
        <p class="section-footnote">Ward Beullens, &ldquo;Breaking Rainbow Takes a Weekend on a Laptop&rdquo; (CRYPTO 2022).</p>
      </div>
    </div>
    <div class="attack-flow">${steps}</div>
    <div class="warning-banner">
      <span aria-hidden="true">\u26A0\uFE0F</span>
      <span>Rainbow is broken and was not standardised by NIST. The UOV scheme above uses tiny teaching parameters and is for education only \u2014 never use either for real signatures.</span>
    </div>
  `;
	return section;
}

// --- comparison table ------------------------------------------------------
function renderCompare(): HTMLElement {
	const section = el('section', 'lab-section');
	const rows = SIG_COMPARE.map(
		(r) => `
    <tr class="math-row">
      <td>${r.family}</td>
      <td><strong>${r.scheme}</strong></td>
      <td class="mono-cell">${r.pubKey}</td>
      <td class="mono-cell">${r.sig}</td>
      <td>${statusChip(r.status)}</td>
    </tr>`,
	).join('');
	section.innerHTML = `
    <div class="section-heading-row">
      <div>
        <p class="section-kicker">Tradeoff</p>
        <h2>Tiny Signatures, Huge Keys</h2>
        <p class="section-footnote">
          Multivariate schemes have the smallest signatures of any post-quantum family \u2014 but
          public keys in the hundreds of kilobytes, and a track record of structural breaks.
          Compare against the standardised lattice and hash families.
        </p>
      </div>
    </div>
    <div class="table-shell">
      <table class="math-table">
        <thead><tr><th>Family</th><th>Scheme</th><th>Public key</th><th>Signature</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
	return section;
}

// --- scheme cards ----------------------------------------------------------
function renderSchemes(): HTMLElement {
	const section = el('section', 'lab-section');
	const cards = SCHEMES.map(
		(s: MvScheme) => `
    <div class="panel-card">
      <div class="panel-header"><h3>${s.name}</h3>${statusChip(s.status)}</div>
      <p class="panel-copy"><strong>${s.year}</strong></p>
      <div class="math-summary-grid">
        <div><p class="hero-metric-label">Public key</p><p class="mono-inline">${s.pubKey}</p></div>
        <div><p class="hero-metric-label">Signature</p><p class="mono-inline">${s.signature}</p></div>
      </div>
      <p class="panel-copy">${s.note}</p>
    </div>`,
	).join('');
	section.innerHTML = `
    <div class="section-heading-row">
      <div>
        <p class="section-kicker">Family tree</p>
        <h2>Oil-and-Vinegar Lineage</h2>
      </div>
    </div>
    <div class="playground-grid">${cards}</div>
  `;
	return section;
}

function renderFooter(): HTMLElement {
	const footer = el('footer', 'lab-section');
	footer.innerHTML = `
    <p class="section-footnote">
      The UOV implementation uses small teaching parameters over GF(256) with the AES reduction
      polynomial. Real multivariate schemes use far larger parameters and careful constant-time
      implementations. Educational use only.
    </p>
    <p class="scripture">\u201CSo whether you eat or drink or whatever you do, do it all for the glory of God.\u201D \u2014 1 Corinthians 10:31</p>
  `;
	return footer;
}

export function mountApp(root: HTMLDivElement): void {
	const shell = el('div', 'page-shell');
	shell.append(
		renderHero(),
		renderPlayground(),
		renderAttack(),
		renderSchemes(),
		renderCompare(),
		renderFooter(),
	);
	root.appendChild(shell);
	void evalMap; // referenced for potential debugging hooks
}
