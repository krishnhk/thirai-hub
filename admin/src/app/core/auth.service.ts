import { Injectable, signal } from '@angular/core';

/**
 * Admin sign-in. Every new sign-in needs a one-time code. For now the signed-in state lasts for this browser tab, so a refresh keeps the admin signed in.
 * The prototype accepts 123456 for any number. The real code will be sent by SMS and checked by the server.
 */
const PROTOTYPE_CODE = '123456';
const MAX_ATTEMPTS = 3;
/** Where the signed-in state is kept for this browser tab, so a refresh does not ask for the code again. */
const SESSION_KEY = 'thiraihub.admin.session';

interface Session {
  phone: string;
  theatreId: number | null;
}

function readSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function writeSession(session: Session | null): void {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage can be blocked; the admin then signs in again after a refresh.
  }
}

export type CodeCheck = 'ok' | 'wrong' | 'locked';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly restored = readSession();
  readonly signedIn = signal(this.restored !== null);
  /**
   * The one theatre this login manages. Each theatre has its own admin login, so the account decides the theatre
   * and the admin never chooses one. The real server returns it from the phone number; the prototype leaves it
   * unset and the store uses the first theatre.
   */
  readonly theatreId = signal<number | null>(this.restored?.theatreId ?? null);

  private phone = this.restored?.phone ?? '';
  private attempts = 0;

  /** Starts a sign-in for this phone number and resets the attempt count. */
  requestCode(phone: string): void {
    this.phone = phone;
    this.attempts = 0;
  }

  get maskedPhone(): string {
    return this.phone.slice(-4);
  }

  checkCode(code: string): CodeCheck {
    if (this.attempts >= MAX_ATTEMPTS) return 'locked';
    if (code === PROTOTYPE_CODE) {
      this.signedIn.set(true);
      writeSession({ phone: this.phone, theatreId: this.theatreId() });
      return 'ok';
    }
    this.attempts++;
    return this.attempts >= MAX_ATTEMPTS ? 'locked' : 'wrong';
  }

  get attemptsLeft(): number {
    return Math.max(0, MAX_ATTEMPTS - this.attempts);
  }

  signOut(): void {
    this.signedIn.set(false);
    this.theatreId.set(null);
    writeSession(null);
    this.phone = '';
    this.attempts = 0;
  }
}
