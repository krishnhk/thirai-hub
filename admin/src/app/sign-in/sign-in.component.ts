import { ChangeDetectionStrategy, Component, ElementRef, ViewChildren, inject, QueryList, signal, computed } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../core/auth.service';

const DIGITS = 6;

/**
 * Theatre admin sign-in. Each theatre has its own login. Two steps: the admin's phone number, then the one-time
 * code sent to it. Nothing is remembered between visits, so every sign-in asks for a code.
 */
@Component({
  selector: 'app-sign-in',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="signin">
      <aside class="intro">
        <header class="brand">
          <span class="logo-tile">
            <svg viewBox="4 12 56 40" aria-hidden="true" focusable="false">
              <path d="M10 16h44a3 3 0 0 1 3 3v8a5 5 0 0 0 0 10v8a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3v-8a5 5 0 0 0 0-10v-8a3 3 0 0 1 3-3z" fill="var(--brand)" />
              <path d="M20 25l12 7-12 7z" fill="var(--on-primary)" />
              <path d="M44 20v24" stroke="var(--on-primary)" stroke-width="2.4" stroke-dasharray="3.5 3.5" />
            </svg>
          </span>
          <span>ThiraiHub<small>Theatre admin</small></span>
        </header>

        <div class="intro-copy">
          <h2>Run your theatre's shows from one place.</h2>
          <ol class="steps">
            <li><b>Design screens</b><span>Draw the seats and set the default prices.</span></li>
            <li><b>Schedule shows</b><span>Add films, times, formats and languages.</span></li>
            <li><b>Publish</b><span>Shows go on sale for customers when you publish them.</span></li>
          </ol>
        </div>

        <svg class="seat-art" viewBox="0 0 240 110" aria-hidden="true" focusable="false">
          <defs>
            <pattern id="seat-grid" width="24" height="22" patternUnits="userSpaceOnUse">
              <rect x="2" y="2" width="18" height="15" rx="5" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="1.5" />
            </pattern>
          </defs>
          <path d="M20 14 Q120 0 220 14" fill="none" stroke="#ffffff" stroke-opacity="0.5" stroke-width="2" />
          <rect x="12" y="30" width="216" height="72" fill="url(#seat-grid)" />
        </svg>

        <p class="intro-foot">Each theatre has its own admin login. Every sign-in needs a one-time code.</p>
      </aside>

      <section class="card" aria-labelledby="signin-title">
        <div class="card-inner">
          <p class="label">Step {{ step() === 'phone' ? 1 : 2 }} of 2</p>
          <div class="progress" aria-hidden="true">
            <span class="on"></span>
            <span [class.on]="step() === 'code'"></span>
          </div>

          @if (step() === 'phone') {
            <div>
              <h1 id="signin-title">Sign in</h1>
              <p class="muted lead">Enter the phone number registered to your theatre's admin login.</p>
              <form class="stack" (submit)="sendCode($event)" novalidate>
                <div class="field">
                  <label for="phone">Admin phone number</label>
                  <input id="phone" class="input" type="tel" inputmode="tel" autocomplete="tel" [value]="phone()" (input)="phone.set(value($event))" [class.invalid]="phoneError()" aria-describedby="phone-error" />
                  @if (phoneError()) {
                    <span class="error" id="phone-error">Enter the 10-digit admin phone number.</span>
                  }
                </div>
                <button class="btn primary wide" type="submit">Send one-time code</button>
              </form>
            </div>
          } @else {
            <div>
              <h1 id="signin-title">Enter the code</h1>
              <p class="muted lead">We sent a six-digit code to the number ending {{ auth.maskedPhone }}.</p>
              <div class="note">Prototype only. The code is <span class="num">123456</span>. The real one arrives by SMS.</div>
              <form class="stack" (submit)="verify($event)" novalidate>
                <fieldset class="digits">
                  <legend class="label">Six-digit code</legend>
                  <div class="digit-row">
                    @for (d of digitIndexes; track d) {
                      <input
                        #digit
                        class="input digit"
                        inputmode="numeric"
                        maxlength="1"
                        autocomplete="off"
                        [attr.aria-label]="'Digit ' + (d + 1)"
                        [value]="code()[d]"
                        [disabled]="locked()"
                        (focus)="selectAll($event)"
                        (input)="typeDigit(d, $event)"
                        (keydown)="backspace(d, $event)"
                        (paste)="paste($event)"
                      />
                    }
                  </div>
                </fieldset>
                @if (error()) {
                  <span class="error" role="alert">{{ error() }}</span>
                }
                <button class="btn primary wide" type="submit" [disabled]="locked()">Sign in</button>
                <div class="row-between">
                  <button class="btn ghost" type="button" (click)="changeNumber()">Change number</button>
                  <button class="btn ghost" type="button" (click)="resend()">Resend code</button>
                </div>
              </form>
            </div>
          }
          <p class="secure">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
            Codes expire, and sign-in locks after three wrong tries.
          </p>
        </div>
      </section>
    </main>
  `,
  styles: `
    .signin {
      min-height: 100vh;
      min-height: 100dvh;
      display: grid;
      grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
    }
    .intro {
      display: flex;
      flex-direction: column;
      gap: 40px;
      padding: clamp(28px, 5vw, 60px);
      background: var(--brand);
      color: var(--on-primary);
    }
    .brand { display: flex; align-items: center; gap: 12px; font-family: var(--font-display); font-weight: 600; font-size: 1.15rem; }
    .brand small { display: block; font-family: var(--font); font-weight: 500; font-size: 0.8rem; opacity: 0.75; }
    .logo-tile { display: grid; place-items: center; width: 52px; height: 52px; border-radius: var(--radius-lg); background: var(--on-primary); flex-shrink: 0; }
    .logo-tile svg { width: 38px; height: auto; }
    .intro-copy h2 { font-size: clamp(1.7rem, 3vw, 2.4rem); line-height: 1.12; max-width: 14ch; }
    .steps { list-style: none; margin: 28px 0 0; padding: 0; display: flex; flex-direction: column; gap: 18px; counter-reset: step; }
    .steps li { display: grid; grid-template-columns: minmax(0, 1fr); gap: 2px; padding-left: 0; }
    .steps b { font-family: var(--font-display); font-weight: 600; font-size: 1.05rem; }
    .steps span { opacity: 0.8; font-size: 0.95rem; }
    .seat-art { width: 100%; max-width: 300px; margin-top: auto; opacity: 0.95; }
    .intro-foot { font-size: 0.88rem; opacity: 0.75; margin-top: 20px; }
    .card { display: flex; align-items: center; justify-content: center; padding: clamp(24px, 5vw, 56px); background: var(--bg); }
    .card-inner {
      width: min(400px, 100%);
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 32px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg);
    }
    .secure { display: flex; align-items: center; gap: 8px; margin-top: 6px; padding-top: 14px; border-top: 1px solid var(--border-soft); font-size: 0.82rem; color: var(--text-muted); }
    .secure svg { width: 16px; height: 16px; flex-shrink: 0; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    .progress { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .progress span { height: 4px; border-radius: 4px; background: var(--surface-3); }
    .progress span.on { background: var(--brand); }
    h1 { margin-top: 6px; }
    .lead { margin-top: 6px; }
    .stack { display: flex; flex-direction: column; gap: 14px; margin-top: 18px; }
    .wide { width: 100%; }
    .note { margin-top: 14px; padding: 10px 12px; border-radius: var(--radius); background: var(--warning-soft); color: var(--warning); font-size: 0.85rem; }
    .digits { border: 0; padding: 0; margin: 0; min-width: 0; }
    .digits legend { margin-bottom: 8px; }
    .digit-row { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; }
    .digit { padding: 8px 0; text-align: center; font-size: 1.3rem; font-weight: 700; font-variant-numeric: tabular-nums; }
    .row-between { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
    @media (max-width: 859px) {
      .signin { grid-template-columns: minmax(0, 1fr); }
      .intro { gap: 18px; padding: 20px 16px; }
      .intro-copy h2 { font-size: 1.4rem; }
      .steps, .intro-foot, .seat-art { display: none; }
      .card { align-items: flex-start; padding: 20px 14px 40px; }
      .card-inner { width: 100%; padding: 22px; box-shadow: var(--shadow-sm); }
    }
  `,
})
export class SignInComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  @ViewChildren('digit') private digitInputs!: QueryList<ElementRef<HTMLInputElement>>;

  readonly digitIndexes = Array.from({ length: DIGITS }, (_, i) => i);
  readonly step = signal<'phone' | 'code'>('phone');
  readonly phone = signal('+91 90000 00001');
  readonly phoneError = signal(false);
  readonly code = signal<string[]>(Array(DIGITS).fill(''));
  readonly error = signal('');
  readonly locked = signal(false);

  readonly codeText = computed(() => this.code().join(''));

  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  sendCode(event: Event): void {
    event.preventDefault();
    const digits = this.phone().replace(/\D/g, '');
    if (digits.length < 10) {
      this.phoneError.set(true);
      return;
    }
    this.phoneError.set(false);
    this.auth.requestCode(digits);
    this.code.set(Array(DIGITS).fill(''));
    this.error.set('');
    this.locked.set(false);
    this.step.set('code');
    queueMicrotask(() => this.focusDigit(0));
  }

  typeDigit(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const digit = input.value.replace(/\D/g, '').slice(0, 1);
    input.value = digit;
    this.setDigit(index, digit);
    if (digit) this.focusDigit(index + 1);
  }

  /** Selecting the digit on focus lets the next key replace it. */
  selectAll(event: Event): void {
    (event.target as HTMLInputElement).select();
  }

  backspace(index: number, event: KeyboardEvent): void {
    if (event.key === 'Backspace' && !this.code()[index]) this.focusDigit(index - 1);
  }

  paste(event: ClipboardEvent): void {
    const text = (event.clipboardData?.getData('text') ?? '').replace(/\D/g, '').slice(0, DIGITS);
    if (!text) return;
    event.preventDefault();
    const next = Array(DIGITS).fill('');
    text.split('').forEach((ch, i) => (next[i] = ch));
    this.code.set(next);
    this.focusDigit(Math.min(text.length, DIGITS - 1));
  }

  verify(event: Event): void {
    event.preventDefault();
    if (this.codeText().length < DIGITS) {
      this.error.set('Enter all six digits.');
      return;
    }
    const result = this.auth.checkCode(this.codeText());
    if (result === 'ok') {
      void this.router.navigateByUrl('/shows');
      return;
    }
    if (result === 'locked') {
      this.locked.set(true);
      this.error.set('Too many wrong codes. Request a new code to continue.');
      return;
    }
    this.error.set(`That code does not match. Check the message and try again (${this.auth.attemptsLeft} tries left).`);
  }

  resend(): void {
    this.auth.requestCode(this.phone().replace(/\D/g, ''));
    this.code.set(Array(DIGITS).fill(''));
    this.error.set('');
    this.locked.set(false);
    this.focusDigit(0);
  }

  changeNumber(): void {
    this.step.set('phone');
    this.error.set('');
  }

  private setDigit(index: number, digit: string): void {
    this.code.update((list) => list.map((d, i) => (i === index ? digit : d)));
  }

  private focusDigit(index: number): void {
    if (index < 0 || index >= DIGITS) return;
    this.digitInputs?.get(index)?.nativeElement.focus();
  }
}
