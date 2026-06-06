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

function announce(msg: string): void {
	const live = document.getElementById('sr-live');
	if (!live) return;
	live.textContent = '';
	window.requestAnimationFrame(() => {
		live.textContent = msg;
	});
}

function statusChip(s: 'broken' | 'research' | 'historical' | 'standardized'): string {
	const map: Record<string, [string, string]> = {
		broken: ['scenario-status--invalid', 'Broken'],
		research: ['scenario-status--pending', 'Research'],
		historical: ['scenario-status--pending', 'Historical'],
		standardized: ['scenario-status--valid', 'Standardized'],
	};
	const [cls, label] = map[s];
	return `<span class="maturity-chip ${cls}" role="status">${label}</span>`;
}

function copyButton(targetId: string, label = 'Copy hex'): string {
	return `<button type="button" class="copy-button" data-copy-target="${targetId}" aria-label="${label}">
		<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 16H8V7h11v14Z"/></svg>
		<span class="copy-button__label">Copy</span>
	</button>`;
}

function renderHero(): HTMLElement {
	const hero = el('header', 'hero-panel');
	hero.setAttribute('role', 'banner');
	hero.innerHTML = `
    <div class="hero-toolbar">
      <a class="portfolio-badge" href="https://github.com/systemslibrarian?tab=repositories&q=crypto-lab" aria-label="View other crypto-lab projects on GitHub">
        <span aria-hidden="true">⚙</span> crypto-lab · portfolio
      </a>
      <button id="theme-toggle" class="theme-toggle" type="button" aria-label="Switch to light mode" aria-pressed="true">
        <span class="theme-toggle__icon" aria-hidden="true">\u{1F319}</span>
      </button>
    </div>
    <div class="hero-copy">
      <p class="eyebrow">Post-Quantum · Multivariate</p>
      <h1>Oil <span class="hero-amp" aria-hidden="true">&amp;</span><span class="sr-only">and</span> Vinegar</h1>
      <p class="hero-text">
        Multivariate cryptography builds signatures on the hardness of solving systems of
        quadratic equations. This lab runs a real, working Unbalanced Oil-and-Vinegar (UOV)
        scheme over GF(256) in your browser — sign a message, watch the trapdoor turn a
        hard nonlinear problem into an easy linear one, then see why Rainbow, the layered
        version, was broken on a laptop in 2022.
      </p>
      <div class="hero-actions">
        <a class="action-button action-button--small" href="#playground-heading">
          <span aria-hidden="true">▶</span> Try the demo
        </a>
        <a class="ghost-button ghost-button--small" href="#attack-heading">
          How Rainbow fell
        </a>
      </div>
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
    <aside class="hero-metric-card" aria-label="The MQ problem">
      <p class="hero-metric-label">The MQ problem</p>
      <div class="hero-metric-value" aria-hidden="true">
        <div>Solve:</div>
        <div>p₁(x) = y₁</div>
        <div>p₂(x) = y₂</div>
        <div>… over GF(256)</div>
      </div>
      <p class="sr-only">Solve a system of multivariate quadratic equations p sub 1 of x equals y sub 1, p sub 2 of x equals y sub 2, and so on, over the finite field GF(256).</p>
      <p class="hero-metric-note">NP-hard in general · easy if you know the trapdoor</p>
    </aside>
  `;
	return hero;
}

// --- Live UOV playground ---------------------------------------------------
function renderPlayground(): HTMLElement {
	const section = el('section', 'lab-section');
	section.id = 'playground';
	section.setAttribute('aria-labelledby', 'playground-heading');
	section.innerHTML = `
    <div class="section-heading-row">
      <div>
        <p class="section-kicker">Live demo</p>
        <h2 id="playground-heading">Sign with the Trapdoor</h2>
        <p class="section-footnote">
          A real UOV scheme with v vinegar and o oil variables over GF(256). Keys, signing,
          and verification all run client-side. Teaching parameters — not production-secure.
        </p>
      </div>
    </div>

    <div class="playground-grid">
      <div class="panel-card panel-card--wide" aria-labelledby="step-1-heading">
        <div class="panel-header">
          <h3 id="step-1-heading"><span class="step-num" aria-hidden="true">1</span> Message &amp; parameters</h3>
        </div>
        <label for="msg" class="field-label">Message to sign</label>
        <textarea id="msg" class="message-input" rows="2" aria-describedby="msg-help">For the glory of God — 1 Cor 10:31</textarea>
        <p id="msg-help" class="field-help">Change the message and watch the target hash change with it.</p>

        <div class="param-row" role="group" aria-label="UOV parameters">
          <label for="vsel">
            <span class="param-row__name">Vinegar (v)</span>
            <select id="vsel" aria-describedby="param-help"><option>4</option><option selected>6</option><option>8</option></select>
          </label>
          <label for="osel">
            <span class="param-row__name">Oil (o)</span>
            <select id="osel" aria-describedby="param-help"><option selected>3</option><option>4</option></select>
          </label>
          <button id="keygen-btn" class="ghost-button" type="button">
            <span aria-hidden="true">↻</span> Generate keypair
          </button>
        </div>
        <p id="param-help" class="field-help">v &gt; o gives the &ldquo;unbalanced&rdquo; structure that resists the 1998 Kipnis–Shamir attack.</p>
        <p id="key-status" class="panel-copy" role="status" aria-live="polite">No keypair yet — generate one to begin.</p>
      </div>

      <div class="panel-card" aria-labelledby="step-2-heading">
        <div class="panel-header">
          <h3 id="step-2-heading"><span class="step-num" aria-hidden="true">2</span> Message hash (target)</h3>
        </div>
        <p class="panel-copy">The message hashes to an o-byte target the signature must hit.</p>
        <div class="mono-block-wrap">
          <div id="target-out" class="mono-block" aria-label="Hashed message target" aria-live="polite">—</div>
          ${copyButton('target-out', 'Copy target hash hex')}
        </div>
      </div>

      <div class="panel-card" aria-labelledby="step-3-heading">
        <div class="panel-header">
          <h3 id="step-3-heading"><span class="step-num" aria-hidden="true">3</span> Sign</h3>
        </div>
        <p class="panel-copy">Guess vinegar → the system goes linear in oil → solve.</p>
        <button id="sign-btn" class="action-button" type="button" disabled aria-describedby="sign-help">
          <span aria-hidden="true">✍</span> Sign message
        </button>
        <p id="sign-help" class="field-help">Produces a fresh signature — vinegar is randomised each time.</p>
        <div id="trace-out" class="trace-out" aria-live="polite"></div>
      </div>

      <div class="panel-card panel-card--wide" aria-labelledby="step-4-heading">
        <div class="panel-header">
          <h3 id="step-4-heading"><span class="step-num" aria-hidden="true">4</span> Verify</h3>
        </div>
        <p class="panel-copy">A signature must satisfy P(signature) = target. Try to break that bond.</p>
        <ul class="scenario-grid" role="list">
          <li class="scenario-card">
            <h4>Valid signature</h4>
            <p class="scenario-copy">Check the signature against the original target.</p>
            <button id="verify-ok" class="ghost-button" type="button" disabled>Verify as-is</button>
            <p id="verify-ok-status" class="scenario-status scenario-status--pending" role="status" aria-live="polite">Awaiting signature</p>
          </li>
          <li class="scenario-card">
            <h4>Tampered signature</h4>
            <p class="scenario-copy">Flip a single byte in the signature.</p>
            <button id="verify-bad" class="ghost-button" type="button" disabled>Flip one byte &amp; verify</button>
            <p id="verify-bad-status" class="scenario-status scenario-status--pending" role="status" aria-live="polite">Awaiting signature</p>
          </li>
          <li class="scenario-card">
            <h4>Tampered message</h4>
            <p class="scenario-copy">Re-hash an edited message and verify the old signature.</p>
            <button id="verify-msg" class="ghost-button" type="button" disabled>Change message &amp; verify</button>
            <p id="verify-msg-status" class="scenario-status scenario-status--pending" role="status" aria-live="polite">Awaiting signature</p>
          </li>
        </ul>
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
		$('key-status').innerHTML = `Keypair ready · n = ${v + o} variables · public map = ${o} quadratics in ${v + o} vars. <strong>Public key hides which variables are oil.</strong>`;
		refreshTarget();
		signBtn.disabled = false;
		[okBtn, badBtn, msgBtn].forEach((b) => (b.disabled = true));
		$('trace-out').innerHTML = '';
		['verify-ok-status', 'verify-bad-status', 'verify-msg-status'].forEach((id) => {
			$(id).className = 'scenario-status scenario-status--pending';
			$(id).textContent = 'Awaiting signature';
		});
		announce(`Keypair generated with ${v} vinegar and ${o} oil variables.`);
	}

	function doSign(): void {
		if (!keys) return;
		refreshTarget();
		trace = sign(keys, target);
		$('trace-out').innerHTML = `
      <div class="trace-step"><span class="trace-label">Vinegar guess</span><span class="mono-inline" id="trace-vinegar">${hexArr(trace.vinegar)}</span></div>
      <div class="trace-step"><span class="trace-label">Solved oil</span><span class="mono-inline" id="trace-oil">${hexArr(trace.oil)}</span></div>
      <div class="trace-step"><span class="trace-label">Signature</span>
        <span class="mono-inline trace-signature" id="trace-signature">${hexArr(trace.signature)}</span>
      </div>
      <div class="trace-actions">
        ${copyButton('trace-signature', 'Copy signature hex')}
      </div>
      <p class="section-footnote">Found a solvable system after ${trace.attempts} vinegar guess${trace.attempts === 1 ? '' : 'es'}. Signing is fast because fixing vinegar makes the equations linear.</p>`;
		[okBtn, badBtn, msgBtn].forEach((b) => (b.disabled = false));
		announce(`Message signed in ${trace.attempts} attempt${trace.attempts === 1 ? '' : 's'}. Verification options enabled.`);
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
		setStatus('verify-ok-status', ok, ok ? '✓ Valid — P(signature) = target' : '✗ Rejected');
	});
	badBtn.addEventListener('click', () => {
		if (!keys || !trace) return;
		const bad = trace.signature.slice();
		bad[0] = (bad[0] ^ 0x01) & 0xff;
		const ok = verify(keys, target, bad);
		setStatus('verify-bad-status', ok, ok ? 'Valid (unexpected!)' : '✗ Rejected — one flipped byte breaks it');
	});
	msgBtn.addEventListener('click', () => {
		if (!keys || !trace) return;
		const otherTarget = hashMessage(msg.value + ' (edited)', keys.params.o);
		const ok = verify(keys, otherTarget, trace.signature);
		setStatus('verify-msg-status', ok, ok ? 'Valid (unexpected!)' : '✗ Rejected — signature is bound to the message');
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
	section.id = 'attack';
	section.setAttribute('aria-labelledby', 'attack-heading');
	const steps = BEULLENS_STORY.map(
		(s, i) => `
    <li class="attack-step">
      <div class="attack-num" aria-hidden="true">${i + 1}</div>
      <div class="attack-step__body">
        <h3>${s.title}</h3>
        <p class="panel-copy">${s.body}</p>
      </div>
    </li>`,
	).join('');
	section.innerHTML = `
    <div class="section-heading-row">
      <div>
        <p class="section-kicker">The break</p>
        <h2 id="attack-heading">How Rainbow Fell</h2>
        <p class="section-footnote">Ward Beullens, &ldquo;Breaking Rainbow Takes a Weekend on a Laptop&rdquo; (CRYPTO 2022).</p>
      </div>
    </div>
    <ol class="attack-flow" role="list">${steps}</ol>
    <div class="warning-banner" role="note">
      <span class="warning-banner__icon" aria-hidden="true">⚠️</span>
      <span>Rainbow is broken and was not standardised by NIST. The UOV scheme above uses tiny teaching parameters and is for education only — never use either for real signatures.</span>
    </div>
  `;
	return section;
}

// --- comparison table ------------------------------------------------------
function renderCompare(): HTMLElement {
	const section = el('section', 'lab-section');
	section.id = 'compare';
	section.setAttribute('aria-labelledby', 'compare-heading');
	const rows = SIG_COMPARE.map(
		(r) => `
    <tr class="math-row">
      <td data-label="Family">${r.family}</td>
      <td data-label="Scheme"><strong>${r.scheme}</strong></td>
      <td class="mono-cell" data-label="Public key">${r.pubKey}</td>
      <td class="mono-cell" data-label="Signature">${r.sig}</td>
      <td data-label="Status">${statusChip(r.status)}</td>
    </tr>`,
	).join('');
	section.innerHTML = `
    <div class="section-heading-row">
      <div>
        <p class="section-kicker">Tradeoff</p>
        <h2 id="compare-heading">Tiny Signatures, Huge Keys</h2>
        <p class="section-footnote">
          Multivariate schemes have the smallest signatures of any post-quantum family — but
          public keys in the hundreds of kilobytes, and a track record of structural breaks.
          Compare against the standardised lattice and hash families.
        </p>
      </div>
    </div>
    <div class="table-shell" role="region" aria-label="Signature size comparison across PQC families" tabindex="0">
      <table class="math-table">
        <caption class="sr-only">Comparison of post-quantum signature families: family, scheme name, public key size, signature size, and standardisation status.</caption>
        <thead><tr><th scope="col">Family</th><th scope="col">Scheme</th><th scope="col">Public key</th><th scope="col">Signature</th><th scope="col">Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="section-footnote table-hint" aria-hidden="true">Scroll horizontally on small screens to see all columns.</p>
  `;
	return section;
}

// --- scheme cards ----------------------------------------------------------
function renderSchemes(): HTMLElement {
	const section = el('section', 'lab-section');
	section.id = 'schemes';
	section.setAttribute('aria-labelledby', 'schemes-heading');
	const cards = SCHEMES.map(
		(s: MvScheme) => `
    <article class="panel-card scheme-card">
      <div class="panel-header"><h3>${s.name}</h3>${statusChip(s.status)}</div>
      <p class="panel-copy"><strong>${s.year}</strong></p>
      <dl class="math-summary-grid">
        <div>
          <dt class="hero-metric-label">Public key</dt>
          <dd class="mono-inline">${s.pubKey}</dd>
        </div>
        <div>
          <dt class="hero-metric-label">Signature</dt>
          <dd class="mono-inline">${s.signature}</dd>
        </div>
      </dl>
      <p class="panel-copy">${s.note}</p>
    </article>`,
	).join('');
	section.innerHTML = `
    <div class="section-heading-row">
      <div>
        <p class="section-kicker">Family tree</p>
        <h2 id="schemes-heading">Oil-and-Vinegar Lineage</h2>
      </div>
    </div>
    <div class="playground-grid">${cards}</div>
  `;
	return section;
}

function renderFooter(): HTMLElement {
	const footer = el('footer', 'lab-section site-footer');
	footer.setAttribute('role', 'contentinfo');
	footer.innerHTML = `
    <p class="section-footnote">
      The UOV implementation uses small teaching parameters over GF(256) with the AES reduction
      polynomial. Real multivariate schemes use far larger parameters and careful constant-time
      implementations. Educational use only.
    </p>
    <p class="footer-links">
      <a href="https://github.com/systemslibrarian/crypto-lab-multivariate" rel="noopener noreferrer">View source on GitHub</a>
      ·
      <a href="https://github.com/systemslibrarian?tab=repositories&q=crypto-lab" rel="noopener noreferrer">Other crypto-lab projects</a>
    </p>
    <p class="scripture">“So whether you eat or drink or whatever you do, do it all for the glory of God.” — 1 Corinthians 10:31</p>
  `;
	return footer;
}

function wireCopyButtons(root: HTMLElement): void {
	root.addEventListener('click', (event) => {
		const target = event.target as HTMLElement;
		const button = target.closest('[data-copy-target]') as HTMLButtonElement | null;
		if (!button) return;
		const sourceId = button.getAttribute('data-copy-target');
		if (!sourceId) return;
		const source = document.getElementById(sourceId);
		if (!source) return;
		const text = (source.textContent || '').trim();
		if (!text) return;
		const finish = (ok: boolean) => {
			const label = button.querySelector('.copy-button__label');
			const original = label?.textContent ?? 'Copy';
			if (label) label.textContent = ok ? 'Copied' : 'Press Ctrl+C';
			button.classList.toggle('is-copied', ok);
			announce(ok ? 'Copied to clipboard.' : 'Copy failed. Press Control or Command C.');
			window.setTimeout(() => {
				if (label) label.textContent = original;
				button.classList.remove('is-copied');
			}, 1600);
		};
		if (navigator.clipboard && window.isSecureContext) {
			navigator.clipboard.writeText(text).then(
				() => finish(true),
				() => finish(false),
			);
		} else {
			try {
				const ta = document.createElement('textarea');
				ta.value = text;
				ta.setAttribute('readonly', '');
				ta.style.position = 'absolute';
				ta.style.left = '-9999px';
				document.body.appendChild(ta);
				ta.select();
				const ok = document.execCommand('copy');
				document.body.removeChild(ta);
				finish(ok);
			} catch {
				finish(false);
			}
		}
	});
}

export function mountApp(root: HTMLDivElement): void {
	const main = el('main', 'page-shell');
	main.id = 'main-content';
	main.setAttribute('tabindex', '-1');
	main.append(
		renderHero(),
		renderPlayground(),
		renderAttack(),
		renderSchemes(),
		renderCompare(),
		renderFooter(),
	);
	root.appendChild(main);
	wireCopyButtons(main);
	void evalMap; // referenced for potential debugging hooks
}
