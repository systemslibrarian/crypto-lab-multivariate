import './style.css';
import './extra.css';
import { keygen, sign, verify, hashMessage } from './uov.ts';
import { mountApp } from './ui.ts';

// Self-test: prove the in-browser UOV scheme signs and verifies.
console.group('crypto-lab-multivariate: UOV self-test');
const keys = keygen({ v: 6, o: 3 });
const target = hashMessage('Soli Deo Gloria', keys.params.o);
const tr = sign(keys, target);
console.log('Params: v=6 o=3, n=9 over GF(256)');
console.log('Target (hash):', target.map((b) => b.toString(16).padStart(2, '0')).join(' '));
console.log('Signature:', tr.signature.map((b) => b.toString(16).padStart(2, '0')).join(' '));
console.log('Vinegar guesses needed:', tr.attempts);
console.log('Verify valid signature:', verify(keys, target, tr.signature));
const tampered = tr.signature.slice();
tampered[0] ^= 0x01;
console.log('Verify tampered signature:', verify(keys, target, tampered));
console.groupEnd();

mountApp(document.querySelector<HTMLDivElement>('#app')!);

(function initThemeToggle(): void {
	const button = document.getElementById('theme-toggle') as HTMLButtonElement | null;
	if (!button) return;
	const icon = button.querySelector('.theme-toggle__icon') as HTMLElement | null;

	function apply(theme: string): void {
		document.documentElement.setAttribute('data-theme', theme);
		try {
			localStorage.setItem('theme', theme);
		} catch {
			/* ignore quota / private mode */
		}
		const isDark = theme === 'dark';
		button!.setAttribute('aria-pressed', String(isDark));
		button!.setAttribute(
			'aria-label',
			isDark ? 'Switch to light mode' : 'Switch to dark mode',
		);
		button!.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
		if (icon) icon.textContent = isDark ? '\u{1F319}' : '☀️';
	}

	const current = document.documentElement.getAttribute('data-theme') ?? 'dark';
	apply(current);

	button.addEventListener('click', () => {
		const next =
			document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
		apply(next);
	});

	// follow OS-level changes only when the user hasn't picked a theme yet
	const media = window.matchMedia('(prefers-color-scheme: dark)');
	const onChange = (e: MediaQueryListEvent) => {
		try {
			if (localStorage.getItem('theme')) return;
		} catch {
			/* ignore */
		}
		apply(e.matches ? 'dark' : 'light');
	};
	if (typeof media.addEventListener === 'function') {
		media.addEventListener('change', onChange);
	}
})();
