// ui.ts — Multivariate cryptography lab UI.
import { keygen, sign, verify, hashMessage, evalMap, type UovKeys, type SignTrace, type Quad } from './uov.ts';
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

const DEFAULT_MSG = 'For the glory of God — 1 Cor 10:31';
const FIRST_VISIT_KEY = 'mv-demo-seen-v1';
const TEXT_MODE_KEY = 'mv-text-mode-v1';

// Dual-mode text helpers. CSS hides the variant that doesn't match the
// current [data-text-mode] on <html>, so both versions are present in DOM
// for screen readers but only one is rendered at a time.
function tech(s: string): string {
	return `<span data-mode="technical">${s}</span>`;
}
function plain(s: string): string {
	return `<span data-mode="plain">${s}</span>`;
}
function dual(technical: string, plainEnglish: string): string {
	return tech(technical) + plain(plainEnglish);
}

function byteColor(b: number): string {
	const hue = (b * 137) % 360;
	return `hsl(${hue}, 62%, 58%)`;
}

function byteGrid(
	bytes: number[],
	options: { id?: string; label: string; tamperedIndex?: number } = { label: '' },
): string {
	const cells = bytes
		.map((b, i) => {
			const isTamper = options.tamperedIndex === i;
			const tooltip = `Byte ${i + 1}: ${hex(b)}${isTamper ? ' · tampered' : ''}`;
			return `<span class="byte-cell${isTamper ? ' byte-cell--tampered' : ''}" style="--byte-color: ${byteColor(b)}; --idx: ${i}" aria-label="${tooltip}" data-tooltip="${tooltip}" tabindex="-1">
				<span class="byte-cell__hex" aria-hidden="true">${hex(b)}</span>
			</span>`;
		})
		.join('');
	const idAttr = options.id ? ` id="${options.id}"` : '';
	const hexCount = bytes.length;
	return `<div${idAttr} class="byte-grid" role="group" aria-label="${options.label} (${hexCount} byte${hexCount === 1 ? '' : 's'})">
		<span class="sr-only" data-byte-hex>${hexArr(bytes)}</span>
		${cells}
	</div>`;
}

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

function fmtMs(ms: number): string {
	if (ms < 1) return '< 1 ms';
	if (ms < 10) return `${ms.toFixed(2)} ms`;
	if (ms < 1000) return `${ms.toFixed(1)} ms`;
	return `${(ms / 1000).toFixed(2)} s`;
}

function pubKeyFingerprint(P: Quad[], n: number): number[] {
	let h = 0x811c9dc5;
	for (const Q of P) {
		for (let i = 0; i < n; i++) {
			for (let j = i; j < n; j++) {
				h ^= Q[i][j];
				h = Math.imul(h, 0x01000193) >>> 0;
			}
		}
	}
	const out: number[] = [];
	for (let k = 0; k < 12; k++) {
		h ^= (k + 1) * 0x9e3779b1;
		h = Math.imul(h, 0x01000193) >>> 0;
		out.push(h & 0xff);
	}
	return out;
}

interface DemoState {
	v: number;
	o: number;
	m: string;
}
function readUrlState(): Partial<DemoState> {
	try {
		const params = new URLSearchParams(location.hash.replace(/^#/, ''));
		const v = parseInt(params.get('v') || '', 10);
		const o = parseInt(params.get('o') || '', 10);
		const m = params.get('m');
		const out: Partial<DemoState> = {};
		if ([4, 6, 8].includes(v)) out.v = v;
		if ([3, 4].includes(o)) out.o = o;
		if (m !== null) out.m = m;
		return out;
	} catch {
		return {};
	}
}
function writeUrlState(state: DemoState): void {
	try {
		const params = new URLSearchParams();
		params.set('v', String(state.v));
		params.set('o', String(state.o));
		params.set('m', state.m);
		const hash = '#' + params.toString();
		if (location.hash !== hash) {
			history.replaceState(null, '', hash);
		}
	} catch {
		/* ignore */
	}
}

function trapdoorSvg(): string {
	// SVG strokes use animated dash offsets to "draw in" on first paint.
	return `<svg class="trapdoor-svg" viewBox="0 0 320 220" aria-hidden="true" focusable="false">
		<defs>
			<linearGradient id="tdGrad" x1="0" x2="1" y1="0" y2="1">
				<stop offset="0%" stop-color="var(--accent)" />
				<stop offset="100%" stop-color="var(--accent-4)" />
			</linearGradient>
			<linearGradient id="tdHard" x1="0" x2="1" y1="0" y2="0">
				<stop offset="0%" stop-color="var(--accent-2)" />
				<stop offset="100%" stop-color="var(--accent-3)" />
			</linearGradient>
			<filter id="tdGlow" x="-20%" y="-20%" width="140%" height="140%">
				<feGaussianBlur stdDeviation="2" result="blur" />
				<feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
			</filter>
		</defs>
		<rect class="td-rect td-rect--hard" x="14" y="14" width="292" height="86" rx="14" fill="none" stroke="url(#tdHard)" stroke-width="2" stroke-dasharray="6 5" />
		<text x="160" y="46" text-anchor="middle" font-family="var(--mono)" font-size="13" fill="var(--ink-strong)">Public map P(x) — nonlinear</text>
		<text x="160" y="72" text-anchor="middle" font-family="var(--mono)" font-size="11" fill="var(--ink-soft)">solving for x is NP-hard</text>
		<line class="td-arrow" x1="160" y1="106" x2="160" y2="128" stroke="var(--accent-3)" stroke-width="2" stroke-dasharray="3 3" />
		<polygon class="td-arrowhead" points="155,124 165,124 160,134" fill="var(--accent-3)" />
		<rect class="td-rect td-rect--easy" x="14" y="138" width="292" height="68" rx="14" fill="none" stroke="url(#tdGrad)" stroke-width="2" filter="url(#tdGlow)" />
		<text x="160" y="165" text-anchor="middle" font-family="var(--mono)" font-size="13" fill="var(--ink-strong)">Fix vinegar → linear in oil</text>
		<text x="160" y="188" text-anchor="middle" font-family="var(--mono)" font-size="11" fill="var(--accent-4)">trapdoor: signer solves an o×o system</text>
	</svg>`;
}

function renderHero(): HTMLElement {
	const hero = el('header', 'hero-panel');
	hero.setAttribute('role', 'banner');
	hero.innerHTML = `
    <div class="hero-toolbar">
      <a class="portfolio-badge" href="https://github.com/systemslibrarian?tab=repositories&q=crypto-lab" aria-label="View other crypto-lab projects on GitHub">
        <span aria-hidden="true">⚙</span> crypto-lab · portfolio
      </a>
      <div class="hero-toolbar__right">
        <button id="text-mode-toggle" class="ghost-button ghost-button--small text-mode-toggle" type="button" aria-pressed="false" aria-label="Toggle plain English explanations">
          <span aria-hidden="true">📖</span>
          <span class="text-mode-toggle__label">Plain English</span>
        </button>
        <button id="share-btn" class="icon-button" type="button" aria-label="Copy shareable demo URL" title="Copy shareable URL">
          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11Z"/></svg>
        </button>
        <button id="shortcuts-btn" class="icon-button" type="button" aria-label="Keyboard shortcuts" aria-expanded="false" aria-controls="shortcuts-panel" title="Keyboard shortcuts">
          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M20 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 12H4V7h16v10ZM6 9h2v2H6V9Zm0 4h2v2H6v-2Zm4-4h2v2h-2V9Zm0 4h2v2h-2v-2Zm4-4h2v2h-2V9Zm0 4h6v2h-6v-2Zm4-4h2v2h-2V9Z"/></svg>
        </button>
        <button id="theme-toggle" class="theme-toggle" type="button" aria-label="Switch to light mode" aria-pressed="true">
          <span class="theme-toggle__icon" aria-hidden="true">\u{1F319}</span>
        </button>
      </div>
    </div>
    <div class="hero-copy">
      <p class="eyebrow">Post-Quantum · Multivariate</p>
      <h1>Oil <span class="hero-amp" aria-hidden="true">&amp;</span><span class="sr-only">and</span> Vinegar</h1>
      <p class="hero-text">${dual(
				`Multivariate cryptography builds signatures on the hardness of solving systems of
				quadratic equations. This lab runs a real, working Unbalanced Oil-and-Vinegar (UOV)
				scheme over GF(256) in your browser — sign a message, watch the trapdoor turn a
				hard nonlinear problem into an easy linear one, then see why Rainbow, the layered
				version, was broken on a laptop in 2022.`,
				`Digital signatures prove a message really came from you. This page does it with
				a method called <em>Oil and Vinegar</em>: there's a math puzzle that looks
				impossible to outsiders, but the signer holds a secret shortcut. Below, you sign
				a message in your browser, then see how a researcher cracked the famous
				&ldquo;Rainbow&rdquo; version in a single weekend in 2022.`,
			)}</p>
      <div class="hero-actions">
        <a class="action-button action-button--small" href="#playground-heading">
          <span aria-hidden="true">▶</span> Try the demo
        </a>
        <a class="ghost-button ghost-button--small" href="#attack-heading">
          How Rainbow fell
        </a>
      </div>
      <details class="why-details">
        <summary>${dual('Why study a broken family?', 'Why care about a system that broke?')}</summary>
        <p>${dual(
					`Multivariate schemes produce the shortest signatures of any post-quantum family, yet
					their trapdoors keep falling to structural attacks. Understanding exactly how Rainbow
					broke is the clearest way to see why NIST chose less-structured lattice assumptions for
					its primary standards.`,
					`These signatures are the smallest of the bunch — which is great for tiny devices.
					But the secret-shortcut keeps turning out to be guessable. Watching exactly how
					that happened in 2022 shows why the standards bodies picked a different, sturdier
					math problem (lattices) for the official replacements.`,
				)}</p>
      </details>
    </div>
    <aside class="hero-metric-card" aria-label="How the trapdoor works">
      <p class="hero-metric-label">The MQ trapdoor</p>
      ${trapdoorSvg()}
      <p class="hero-metric-note">${dual(
				'NP-hard in general · easy if you know which variables are oil',
				'Looks impossible · easy with the secret',
			)}</p>
    </aside>
    <div id="shortcuts-panel" class="shortcuts-panel" aria-label="Keyboard shortcuts" hidden>
      <div class="shortcuts-panel__inner">
        <h2 class="shortcuts-panel__title">Keyboard shortcuts</h2>
        <ul>
          <li><kbd>G</kbd> Generate new keypair</li>
          <li><kbd>S</kbd> Sign current message</li>
          <li><kbd>V</kbd> Verify as-is</li>
          <li><kbd>B</kbd> Run benchmark (200 signatures)</li>
          <li><kbd>T</kbd> Toggle theme</li>
          <li><kbd>P</kbd> Toggle plain-English mode</li>
          <li><kbd>?</kbd> Show / hide this panel</li>
          <li><kbd>Esc</kbd> Close this panel</li>
        </ul>
        <button type="button" class="ghost-button ghost-button--small" data-close-shortcuts>Close</button>
      </div>
    </div>
  `;
	return hero;
}

function renderSectionNav(): HTMLElement {
	const nav = el('nav', 'section-nav');
	nav.setAttribute('aria-label', 'Section navigation');
	nav.innerHTML = `
		<div class="section-nav__inner">
			<a href="#playground-heading" data-section="playground"><span aria-hidden="true">▶</span> Live demo</a>
			<a href="#attack-heading" data-section="attack"><span aria-hidden="true">⚡</span> The break</a>
			<a href="#schemes-heading" data-section="schemes"><span aria-hidden="true">▤</span> Lineage</a>
			<a href="#compare-heading" data-section="compare"><span aria-hidden="true">▥</span> Compare</a>
		</div>
	`;
	return nav;
}

function renderPlayground(): HTMLElement {
	const section = el('section', 'lab-section');
	section.id = 'playground';
	section.setAttribute('aria-labelledby', 'playground-heading');
	section.innerHTML = `
    <div class="section-heading-row">
      <div>
        <p class="section-kicker">Live demo</p>
        <h2 id="playground-heading">${dual('Sign with the Trapdoor', 'Sign a message — with a secret')}</h2>
        <p class="section-footnote">${dual(
					`A real UOV scheme with v vinegar and o oil variables over GF(256). Keys, signing,
					and verification all run client-side. Teaching parameters — not production-secure.`,
					`A real signature system, running right here in your browser. Tweak the knobs,
					sign a sentence, then try to forge it.`,
				)}</p>
      </div>
      <div class="timing-strip" role="group" aria-label="Latest operation timings">
        <div class="timing-pill" data-timing="keygen"><span class="timing-pill__label">Keygen</span><span class="timing-pill__value" id="t-keygen">—</span></div>
        <div class="timing-pill" data-timing="sign"><span class="timing-pill__label">Sign</span><span class="timing-pill__value" id="t-sign">—</span></div>
        <div class="timing-pill" data-timing="verify"><span class="timing-pill__label">Verify</span><span class="timing-pill__value" id="t-verify">—</span></div>
      </div>
    </div>

    <div class="playground-grid">
      <div class="panel-card panel-card--wide" aria-labelledby="step-1-heading">
        <div class="panel-header">
          <h3 id="step-1-heading"><span class="step-num" aria-hidden="true">1</span> ${dual('Message &amp; parameters', 'Pick a message')}</h3>
          <button id="reset-btn" class="ghost-button ghost-button--small" type="button" title="Reset playground to defaults">
            <span aria-hidden="true">↺</span> Reset
          </button>
        </div>
        <label for="msg" class="field-label">${dual('Message to sign', 'Your message')}</label>
        <textarea id="msg" class="message-input" rows="2" aria-describedby="msg-help" autocomplete="off" spellcheck="false">${DEFAULT_MSG}</textarea>
        <p id="msg-help" class="field-help">${dual(
					'Change the message and watch the target hash change with it.',
					'Type anything. The hash beside it changes with every keystroke.',
				)}</p>

        <div class="param-row" role="group" aria-label="UOV parameters">
          <label for="vsel">
            <span class="param-row__name">Vinegar (v)</span>
            <select id="vsel" aria-describedby="param-help"><option>4</option><option selected>6</option><option>8</option></select>
          </label>
          <label for="osel">
            <span class="param-row__name">Oil (o)</span>
            <select id="osel" aria-describedby="param-help"><option selected>3</option><option>4</option></select>
          </label>
          <button id="keygen-btn" class="ghost-button" type="button" aria-keyshortcuts="g">
            <span class="ghost-button__spinner" aria-hidden="true"></span>
            <span aria-hidden="true" class="ghost-button__icon">↻</span>
            <span>Generate</span> <kbd class="kbd-hint" aria-hidden="true">G</kbd>
          </button>
        </div>
        <p id="param-help" class="field-help">${dual(
					'v &gt; o gives the &ldquo;unbalanced&rdquo; structure that resists the 1998 Kipnis–Shamir attack.',
					'More vinegar than oil is what keeps this safe. Equal amounts was broken in 1998.',
				)}</p>
        <p id="key-status" class="panel-copy" role="status" aria-live="polite">No keypair yet — generate one to begin.</p>

        <div class="fingerprint-row">
          <span class="fingerprint-row__label">${dual('Public key fingerprint', "Verifier's stamp")}</span>
          <div id="pk-fingerprint" class="fingerprint-grid"></div>
          <p class="field-help fingerprint-row__hint">${dual(
						'A 12-byte FNV hash of the public map — what the verifier holds on to.',
						"A short summary the verifier holds. It changes completely each time you regenerate.",
					)}</p>
        </div>
      </div>

      <div class="panel-card" aria-labelledby="step-2-heading">
        <div class="panel-header">
          <h3 id="step-2-heading"><span class="step-num" aria-hidden="true">2</span> ${dual('Message hash (target)', 'Message → target')}</h3>
        </div>
        <p class="panel-copy">${dual(
					'The message hashes to an o-byte target the signature must hit.',
					'Your message gets squashed into a short fingerprint. The signature has to land exactly here.',
				)}</p>
        <div class="byte-grid-wrap">
          <div id="target-byte-grid" class="byte-grid-host" aria-live="polite"></div>
          ${copyButton('target-byte-grid', 'Copy target hash hex')}
        </div>
      </div>

      <div class="panel-card" aria-labelledby="step-3-heading">
        <div class="panel-header">
          <h3 id="step-3-heading"><span class="step-num" aria-hidden="true">3</span> Sign</h3>
        </div>
        <p class="panel-copy">${dual(
					'Guess vinegar → the system goes linear in oil → solve.',
					'Pick random vinegar, the puzzle collapses into normal high-school algebra, solve it.',
				)}</p>
        <div class="sign-controls">
          <button id="sign-btn" class="action-button" type="button" disabled aria-describedby="sign-help" aria-keyshortcuts="s">
            <span aria-hidden="true">✍</span> <span>Sign</span> <kbd class="kbd-hint" aria-hidden="true">S</kbd>
          </button>
          <button id="bench-btn" class="ghost-button ghost-button--small" type="button" disabled aria-keyshortcuts="b" aria-label="Run a benchmark of 200 signatures">
            <span aria-hidden="true">⏱</span> <span>Benchmark</span> <kbd class="kbd-hint" aria-hidden="true">B</kbd>
          </button>
        </div>
        <p id="sign-help" class="field-help">${dual(
					'Produces a fresh signature — vinegar is randomised each time.',
					'Each click makes a brand-new signature. Same message, different signature, still valid.',
				)}</p>
        <div id="trace-out" class="trace-out" aria-live="polite">
          <p class="trace-empty">${dual(
						'No signature yet. After generating a keypair, hit <kbd>S</kbd> or the sign button above to see the vinegar guess, the solved oil values, and the final signature byte-by-byte.',
						'Nothing signed yet. Hit <kbd>S</kbd> or the Sign button to watch the secret shortcut produce a signature, byte by byte.',
					)}</p>
        </div>
        <div id="bench-result" class="bench-result" hidden></div>
      </div>

      <div class="panel-card panel-card--wide" aria-labelledby="step-4-heading">
        <div class="panel-header">
          <h3 id="step-4-heading"><span class="step-num" aria-hidden="true">4</span> Verify</h3>
          <button id="verify-all-btn" class="ghost-button ghost-button--small" type="button" disabled title="Run all three verification scenarios">
            <span aria-hidden="true">⟳</span> ${dual('Run all', 'Try all three')}
          </button>
        </div>
        <p class="panel-copy">${dual(
					'A signature must satisfy P(signature) = target. Try to break that bond.',
					'A real signature has to match the target exactly. Watch what happens when you mess with anything.',
				)}</p>
        <ul class="scenario-grid" role="list">
          <li class="scenario-card" data-scenario="ok">
            <div class="scenario-card__header">
              <h4>${dual('Valid signature', 'As-is')}</h4>
              <span class="scenario-card__icon" aria-hidden="true">✓</span>
            </div>
            <p class="scenario-copy">${dual(
							'Check the signature against the original target.',
							"Verify exactly what we signed — should pass.",
						)}</p>
            <button id="verify-ok" class="ghost-button" type="button" disabled aria-keyshortcuts="v">Verify as-is</button>
            <p id="verify-ok-status" class="scenario-status scenario-status--pending" role="status" aria-live="polite">Awaiting signature</p>
          </li>
          <li class="scenario-card" data-scenario="bad">
            <div class="scenario-card__header">
              <h4>${dual('Tampered signature', 'Flipped byte')}</h4>
              <span class="scenario-card__icon" aria-hidden="true">⚡</span>
            </div>
            <p class="scenario-copy">${dual(
							'Flip a single byte in the signature.',
							"Change one tiny byte in the signature — should fail.",
						)}</p>
            <button id="verify-bad" class="ghost-button" type="button" disabled>${dual('Flip one byte &amp; verify', 'Flip a byte')}</button>
            <div id="verify-bad-detail" class="scenario-detail" aria-hidden="true"></div>
            <p id="verify-bad-status" class="scenario-status scenario-status--pending" role="status" aria-live="polite">Awaiting signature</p>
          </li>
          <li class="scenario-card" data-scenario="msg">
            <div class="scenario-card__header">
              <h4>${dual('Tampered message', 'Edited message')}</h4>
              <span class="scenario-card__icon" aria-hidden="true">✎</span>
            </div>
            <p class="scenario-copy">${dual(
							'Re-hash an edited message and verify the old signature.',
							"Change the message itself, then check the old signature — should fail.",
						)}</p>
            <button id="verify-msg" class="ghost-button" type="button" disabled>${dual('Change message &amp; verify', 'Edit message')}</button>
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
	const benchBtn = $('bench-btn') as HTMLButtonElement;
	const okBtn = $('verify-ok') as HTMLButtonElement;
	const badBtn = $('verify-bad') as HTMLButtonElement;
	const msgBtn = $('verify-msg') as HTMLButtonElement;
	const verifyAllBtn = $('verify-all-btn') as HTMLButtonElement;
	const resetBtn = $('reset-btn') as HTMLButtonElement;
	const keygenBtn = $('keygen-btn') as HTMLButtonElement;

	function persistState(): void {
		writeUrlState({
			v: parseInt(vsel.value, 10),
			o: parseInt(osel.value, 10),
			m: msg.value,
		});
	}

	function setTiming(id: string, ms: number | null): void {
		const node = section.querySelector('#' + id) as HTMLElement | null;
		if (!node) return;
		node.textContent = ms === null ? '—' : fmtMs(ms);
		const pill = node.closest('.timing-pill');
		if (pill && ms !== null) {
			pill.classList.remove('is-fresh');
			void (pill as HTMLElement).offsetWidth;
			pill.classList.add('is-fresh');
		}
	}

	function refreshTarget(): void {
		if (!keys) return;
		target = hashMessage(msg.value, keys.params.o);
		$('target-byte-grid').innerHTML = byteGrid(target, { label: 'Target hash' });
	}

	function clearVerifyState(): void {
		(section.querySelectorAll('[data-scenario]') as NodeListOf<HTMLElement>).forEach((card) => {
			card.classList.remove('is-valid', 'is-invalid');
		});
		['verify-ok-status', 'verify-bad-status', 'verify-msg-status'].forEach((id) => {
			$(id).className = 'scenario-status scenario-status--pending';
			$(id).textContent = 'Awaiting signature';
		});
		$('verify-bad-detail').innerHTML = '';
	}

	function renderFingerprint(): void {
		if (!keys) {
			$('pk-fingerprint').innerHTML = '<span class="fingerprint-grid__pending">No keypair yet</span>';
			return;
		}
		const fp = pubKeyFingerprint(keys.P, keys.n);
		$('pk-fingerprint').innerHTML = byteGrid(fp, {
			id: 'pk-fingerprint-grid',
			label: 'Public key fingerprint',
		});
	}

	async function doKeygen(): Promise<void> {
		const v = parseInt(vsel.value, 10);
		const o = parseInt(osel.value, 10);
		keygenBtn.classList.add('is-busy');
		keygenBtn.disabled = true;
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		try {
			const t0 = performance.now();
			keys = keygen({ v, o });
			const dt = performance.now() - t0;
			setTiming('t-keygen', dt);
			setTiming('t-sign', null);
			setTiming('t-verify', null);
			trace = null;
			$('key-status').innerHTML = `Keypair ready · n = ${v + o} variables · public map = ${o} quadratics in ${v + o} vars. <strong>Public key hides which variables are oil.</strong>`;
			refreshTarget();
			renderFingerprint();
			signBtn.disabled = false;
			benchBtn.disabled = false;
			[okBtn, badBtn, msgBtn, verifyAllBtn].forEach((b) => (b.disabled = true));
			$('trace-out').innerHTML = `<p class="trace-empty">${dual(
				'No signature yet. After generating a keypair, hit <kbd>S</kbd> or the sign button above to see the vinegar guess, the solved oil values, and the final signature byte-by-byte.',
				'Nothing signed yet. Hit <kbd>S</kbd> or the Sign button to watch the secret shortcut produce a signature, byte by byte.',
			)}</p>`;
			$('bench-result').setAttribute('hidden', '');
			$('bench-result').innerHTML = '';
			clearVerifyState();
			announce(`Keypair generated with ${v} vinegar and ${o} oil variables in ${fmtMs(dt)}.`);
			persistState();
			markFirstVisitSeen();
		} finally {
			keygenBtn.classList.remove('is-busy');
			keygenBtn.disabled = false;
		}
	}

	function doSign(): void {
		if (!keys) return;
		refreshTarget();
		const t0 = performance.now();
		trace = sign(keys, target);
		const dt = performance.now() - t0;
		setTiming('t-sign', dt);
		$('trace-out').innerHTML = `
      <div class="trace-step"><span class="trace-label">Vinegar guess</span>
        <div class="trace-bytes">${byteGrid(trace.vinegar, { id: 'trace-vinegar', label: 'Random vinegar bytes' })}</div>
      </div>
      <div class="trace-step"><span class="trace-label">Solved oil</span>
        <div class="trace-bytes">${byteGrid(trace.oil, { id: 'trace-oil', label: 'Solved oil bytes' })}</div>
      </div>
      <div class="trace-step trace-step--highlight"><span class="trace-label">Signature</span>
        <div class="trace-bytes">${byteGrid(trace.signature, { id: 'trace-signature', label: 'Final signature bytes' })}</div>
      </div>
      <div class="trace-actions">
        ${copyButton('trace-signature', 'Copy signature hex')}
      </div>
      <p class="section-footnote">Found a solvable system after ${trace.attempts} vinegar guess${trace.attempts === 1 ? '' : 'es'}. Signing is fast because fixing vinegar makes the equations linear.</p>`;
		[okBtn, badBtn, msgBtn, verifyAllBtn].forEach((b) => (b.disabled = false));
		announce(`Message signed in ${fmtMs(dt)} after ${trace.attempts} attempt${trace.attempts === 1 ? '' : 's'}. Verification options enabled.`);
	}

	async function doBenchmark(): Promise<void> {
		if (!keys) return;
		const N = 200;
		const result = $('bench-result');
		result.removeAttribute('hidden');
		result.innerHTML = `<div class="bench-progress">
			<div class="bench-progress__label">Running ${N} signatures…</div>
			<div class="bench-progress__bar"><div class="bench-progress__fill" id="bench-fill" style="width: 0%"></div></div>
		</div>`;
		benchBtn.disabled = true;
		signBtn.disabled = true;
		await new Promise((r) => requestAnimationFrame(() => r(null)));

		const timings: number[] = [];
		const attempts: number[] = [];
		let totalT = 0;
		const chunk = 25;
		for (let i = 0; i < N; i += chunk) {
			const end = Math.min(i + chunk, N);
			const chunkStart = performance.now();
			for (let k = i; k < end; k++) {
				const t0 = performance.now();
				const t = sign(keys, hashMessage(msg.value + ' #' + k, keys.params.o));
				const dt = performance.now() - t0;
				timings.push(dt);
				attempts.push(t.attempts);
			}
			totalT += performance.now() - chunkStart;
			const fill = document.getElementById('bench-fill') as HTMLElement | null;
			if (fill) fill.style.width = `${(end / N) * 100}%`;
			await new Promise((r) => setTimeout(r, 0));
		}

		const avg = totalT / N;
		const min = Math.min(...timings);
		const max = Math.max(...timings);
		const sigsPerSec = 1000 / avg;
		const avgAttempts = attempts.reduce((a, b) => a + b, 0) / N;

		result.innerHTML = `
			<div class="bench-grid">
				<div class="bench-stat"><span class="bench-stat__label">Throughput</span><span class="bench-stat__value">${sigsPerSec.toFixed(0)}<small> sig/s</small></span></div>
				<div class="bench-stat"><span class="bench-stat__label">Avg / sign</span><span class="bench-stat__value">${fmtMs(avg)}</span></div>
				<div class="bench-stat"><span class="bench-stat__label">Min</span><span class="bench-stat__value">${fmtMs(min)}</span></div>
				<div class="bench-stat"><span class="bench-stat__label">Max</span><span class="bench-stat__value">${fmtMs(max)}</span></div>
				<div class="bench-stat"><span class="bench-stat__label">Avg attempts</span><span class="bench-stat__value">${avgAttempts.toFixed(2)}</span></div>
				<div class="bench-stat"><span class="bench-stat__label">Total</span><span class="bench-stat__value">${fmtMs(totalT)}</span></div>
			</div>
			<p class="section-footnote">Benchmark over ${N} signatures on this device. Vinegar is re-randomised each round, so attempt counts vary.</p>`;
		announce(`Benchmark complete: ${sigsPerSec.toFixed(0)} signatures per second, average ${fmtMs(avg)}.`);
		benchBtn.disabled = false;
		signBtn.disabled = false;
	}

	function setStatus(scenario: 'ok' | 'bad' | 'msg', ok: boolean, text: string): void {
		const statusId = `verify-${scenario}-status`;
		const node = $(statusId);
		node.className = `scenario-status ${ok ? 'scenario-status--valid' : 'scenario-status--invalid'}`;
		node.textContent = text;
		const card = section.querySelector(`[data-scenario="${scenario}"]`) as HTMLElement | null;
		if (card) {
			card.classList.remove('is-valid', 'is-invalid');
			void card.offsetWidth;
			card.classList.add(ok ? 'is-valid' : 'is-invalid');
		}
	}

	function withVerifyTime<T>(fn: () => T): T {
		const t0 = performance.now();
		const result = fn();
		setTiming('t-verify', performance.now() - t0);
		return result;
	}

	keygenBtn.addEventListener('click', () => {
		void doKeygen();
	});
	signBtn.addEventListener('click', doSign);
	benchBtn.addEventListener('click', () => {
		void doBenchmark();
	});
	resetBtn.addEventListener('click', () => {
		msg.value = DEFAULT_MSG;
		vsel.value = '6';
		osel.value = '3';
		void doKeygen();
		announce('Playground reset.');
	});
	msg.addEventListener('input', () => {
		if (keys) refreshTarget();
		persistState();
	});
	[vsel, osel].forEach((sel) =>
		sel.addEventListener('change', () => {
			persistState();
			void doKeygen();
		}),
	);

	okBtn.addEventListener('click', () => {
		if (!keys || !trace) return;
		const ok = withVerifyTime(() => verify(keys!, target, trace!.signature));
		setStatus('ok', ok, ok ? '✓ Valid — P(signature) = target' : '✗ Rejected');
	});
	badBtn.addEventListener('click', () => {
		if (!keys || !trace) return;
		const bad = trace.signature.slice();
		const tamperedIdx = Math.floor(Math.random() * bad.length);
		const originalByte = bad[tamperedIdx];
		bad[tamperedIdx] = (bad[tamperedIdx] ^ 0x01) & 0xff;
		const ok = withVerifyTime(() => verify(keys!, target, bad));
		$('verify-bad-detail').innerHTML = `
			<p class="scenario-detail__caption">Byte ${tamperedIdx + 1} flipped: ${hex(originalByte)} → ${hex(bad[tamperedIdx])}</p>
			${byteGrid(bad, { label: 'Tampered signature bytes', tamperedIndex: tamperedIdx })}`;
		$('verify-bad-detail').setAttribute('aria-hidden', 'false');
		setStatus('bad', ok, ok ? 'Valid (unexpected!)' : `✗ Rejected — byte ${tamperedIdx + 1} flipped`);
	});
	msgBtn.addEventListener('click', () => {
		if (!keys || !trace) return;
		const otherTarget = hashMessage(msg.value + ' (edited)', keys.params.o);
		const ok = withVerifyTime(() => verify(keys!, otherTarget, trace!.signature));
		setStatus('msg', ok, ok ? 'Valid (unexpected!)' : '✗ Rejected — signature is bound to the message');
	});
	verifyAllBtn.addEventListener('click', () => {
		okBtn.click();
		window.setTimeout(() => badBtn.click(), 220);
		window.setTimeout(() => msgBtn.click(), 440);
	});

	const url = readUrlState();
	if (url.v != null) vsel.value = String(url.v);
	if (url.o != null) osel.value = String(url.o);
	if (url.m != null) msg.value = url.m;

	queueMicrotask(() => {
		void doKeygen();
	});

	document.addEventListener('keydown', (event) => {
		const t = event.target as HTMLElement;
		if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
			return;
		}
		if (event.altKey || event.ctrlKey || event.metaKey) return;
		const key = event.key.toLowerCase();
		if (key === 'g') {
			event.preventDefault();
			void doKeygen();
		} else if (key === 's' && !signBtn.disabled) {
			event.preventDefault();
			doSign();
		} else if (key === 'v' && !okBtn.disabled) {
			event.preventDefault();
			okBtn.click();
		} else if (key === 'b' && !benchBtn.disabled) {
			event.preventDefault();
			void doBenchmark();
		}
	});

	return section;
}

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
      <td data-label="Feels like" class="feel-cell">${r.feel}</td>
      <td data-label="Status">${statusChip(r.status)}</td>
    </tr>`,
	).join('');
	section.innerHTML = `
    <div class="section-heading-row">
      <div>
        <p class="section-kicker">Tradeoff</p>
        <h2 id="compare-heading">Tiny Signatures, Huge Keys</h2>
        <p class="section-footnote">${dual(
					`Multivariate schemes have the smallest signatures of any post-quantum family — but
					public keys in the hundreds of kilobytes, and a track record of structural breaks.
					Compare against the standardised lattice and hash families.`,
					`Multivariate signatures are the smallest of any post-quantum option — but the
					"public" half of the key can be the size of a phone photo, and the math has
					broken more than once.`,
				)}</p>
      </div>
    </div>
    <div class="table-shell" role="region" aria-label="Signature size comparison across PQC families" tabindex="0">
      <table class="math-table">
        <caption class="sr-only">Comparison of post-quantum signature families: family, scheme name, public key size, signature size, an everyday-object analogy, and standardisation status.</caption>
        <thead><tr><th scope="col">Family</th><th scope="col">Scheme</th><th scope="col">Public key</th><th scope="col">Signature</th><th scope="col">Feels like</th><th scope="col">Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="section-footnote table-hint">Scroll horizontally on small screens to see all columns.</p>
  `;
	return section;
}

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

function renderBackToTop(): HTMLElement {
	const btn = el('button', 'back-to-top');
	btn.type = 'button';
	btn.setAttribute('aria-label', 'Scroll back to top');
	btn.hidden = true;
	btn.innerHTML = `<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 4 4 12h5v8h6v-8h5L12 4Z"/></svg>`;
	btn.addEventListener('click', () => {
		window.scrollTo({ top: 0, behavior: 'smooth' });
	});
	return btn;
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
		const hexNode = source.querySelector('[data-byte-hex]');
		const text = (hexNode?.textContent ?? source.textContent ?? '').trim();
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

function wireShareButton(): void {
	const btn = document.getElementById('share-btn') as HTMLButtonElement | null;
	if (!btn) return;
	btn.addEventListener('click', async () => {
		const url = location.href;
		const flash = (msg: string) => {
			btn.classList.add('is-copied');
			btn.setAttribute('aria-label', msg);
			announce(msg);
			window.setTimeout(() => {
				btn.classList.remove('is-copied');
				btn.setAttribute('aria-label', 'Copy shareable demo URL');
			}, 1600);
		};
		try {
			if (navigator.share) {
				await navigator.share({ title: 'Oil & Vinegar lab', url });
				return;
			}
			await navigator.clipboard.writeText(url);
			flash('Demo URL copied to clipboard.');
		} catch {
			flash('Copy failed.');
		}
	});
}

function wireShortcutsPanel(root: HTMLElement): void {
	const btn = root.querySelector('#shortcuts-btn') as HTMLButtonElement | null;
	const panel = root.querySelector('#shortcuts-panel') as HTMLElement | null;
	if (!btn || !panel) return;
	const closeBtn = panel.querySelector('[data-close-shortcuts]') as HTMLButtonElement | null;
	const isHidden = () => Boolean(panel.hidden);
	const open = (state: boolean) => {
		panel.hidden = !state;
		btn.setAttribute('aria-expanded', String(state));
		if (state) closeBtn?.focus();
	};
	btn.addEventListener('click', () => open(isHidden()));
	closeBtn?.addEventListener('click', () => {
		open(false);
		btn.focus();
	});
	document.addEventListener('keydown', (event) => {
		const t = event.target as HTMLElement;
		if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
		if (event.key === '?' || (event.shiftKey && event.key === '/')) {
			event.preventDefault();
			open(isHidden());
		} else if (event.key === 'Escape' && !isHidden()) {
			open(false);
			btn.focus();
		}
	});
}

function wireSectionNavObserver(nav: HTMLElement, sections: HTMLElement[]): void {
	const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>('a[data-section]'));
	const byId: Record<string, HTMLAnchorElement> = {};
	links.forEach((a) => {
		const key = a.getAttribute('data-section') || '';
		byId[key] = a;
	});
	const observer = new IntersectionObserver(
		(entries) => {
			entries.forEach((entry) => {
				if (!entry.isIntersecting) return;
				const id = (entry.target as HTMLElement).id;
				links.forEach((a) => a.classList.remove('is-active'));
				byId[id]?.classList.add('is-active');
			});
		},
		{ rootMargin: '-35% 0px -55% 0px' },
	);
	sections.forEach((s) => observer.observe(s));
}

function wireScrollReveal(root: HTMLElement): void {
	if (typeof IntersectionObserver === 'undefined') return;
	if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
	const items = root.querySelectorAll<HTMLElement>('.lab-section, .panel-card, .attack-step, .scheme-card');
	const observer = new IntersectionObserver(
		(entries) => {
			entries.forEach((entry) => {
				if (entry.isIntersecting) {
					entry.target.classList.add('reveal-in');
					observer.unobserve(entry.target);
				}
			});
		},
		{ rootMargin: '0px 0px -8% 0px' },
	);
	items.forEach((it) => observer.observe(it));
}

function wireBackToTop(btn: HTMLElement): void {
	let visible = false;
	const update = () => {
		const shouldShow = window.scrollY > 600;
		if (shouldShow !== visible) {
			visible = shouldShow;
			btn.hidden = !shouldShow;
		}
	};
	window.addEventListener('scroll', update, { passive: true });
	update();
}

function applyTextMode(mode: 'technical' | 'plain'): void {
	document.documentElement.setAttribute('data-text-mode', mode);
	const btn = document.getElementById('text-mode-toggle');
	if (btn) {
		btn.setAttribute('aria-pressed', String(mode === 'plain'));
		const label = btn.querySelector('.text-mode-toggle__label');
		if (label) label.textContent = mode === 'plain' ? 'Technical' : 'Plain English';
	}
	try {
		localStorage.setItem(TEXT_MODE_KEY, mode);
	} catch {
		/* ignore */
	}
}

function wireTextModeToggle(): void {
	let saved: string | null = null;
	try {
		saved = localStorage.getItem(TEXT_MODE_KEY);
	} catch {
		/* ignore */
	}
	const initial: 'technical' | 'plain' = saved === 'plain' ? 'plain' : 'technical';
	applyTextMode(initial);
	const btn = document.getElementById('text-mode-toggle');
	btn?.addEventListener('click', () => {
		const current = document.documentElement.getAttribute('data-text-mode');
		applyTextMode(current === 'plain' ? 'technical' : 'plain');
		announce(`Switched to ${current === 'plain' ? 'technical' : 'plain English'} text.`);
	});
	document.addEventListener('keydown', (event) => {
		const t = event.target as HTMLElement;
		if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
		if (event.altKey || event.ctrlKey || event.metaKey) return;
		if (event.key.toLowerCase() === 'p') {
			event.preventDefault();
			(btn as HTMLButtonElement | null)?.click();
		}
	});
}

let firstVisitSeen = false;
function markFirstVisitSeen(): void {
	if (firstVisitSeen) return;
	firstVisitSeen = true;
	document.documentElement.classList.remove('is-first-visit');
	try {
		localStorage.setItem(FIRST_VISIT_KEY, '1');
	} catch {
		/* ignore */
	}
}

function wireFirstVisitHint(): void {
	let already = false;
	try {
		already = !!localStorage.getItem(FIRST_VISIT_KEY);
	} catch {
		/* ignore */
	}
	if (already) {
		firstVisitSeen = true;
		return;
	}
	document.documentElement.classList.add('is-first-visit');
	const dismissOnInteract = () => {
		markFirstVisitSeen();
		window.removeEventListener('pointerdown', dismissOnInteract, true);
		window.removeEventListener('keydown', dismissOnInteract, true);
	};
	window.addEventListener('pointerdown', dismissOnInteract, true);
	window.addEventListener('keydown', dismissOnInteract, true);
	// also auto-dismiss after 12 seconds so it doesn't loop forever
	window.setTimeout(markFirstVisitSeen, 12000);
}

export function mountApp(root: HTMLDivElement): void {
	const main = el('main', 'page-shell');
	main.id = 'main-content';
	main.setAttribute('tabindex', '-1');
	const hero = renderHero();
	const nav = renderSectionNav();
	const playground = renderPlayground();
	const attack = renderAttack();
	const schemes = renderSchemes();
	const compare = renderCompare();
	const footer = renderFooter();
	main.append(hero, nav, playground, attack, schemes, compare, footer);
	root.appendChild(main);
	const backToTop = renderBackToTop();
	document.body.appendChild(backToTop);
	wireCopyButtons(main);
	wireShortcutsPanel(main);
	wireShareButton();
	wireSectionNavObserver(nav, [playground, attack, schemes, compare]);
	wireScrollReveal(main);
	wireBackToTop(backToTop);
	wireTextModeToggle();
	wireFirstVisitHint();
	void evalMap;
}
