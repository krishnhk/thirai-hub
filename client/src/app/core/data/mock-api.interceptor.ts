import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, delay, of, throwError } from 'rxjs';

import { MockApiError, MockStore } from './mock-store';

const API_PREFIX = '/api';
const MOCK_LATENCY_MS = 220;

/**
 * Serves the ThiraiHub REST contract from the in-memory mock store.
 *
 * Everything the frontend does goes through HttpClient against `/api/**`, so
 * the app works today without the ASP.NET backend. To point the app at the
 * real API, remove `mockApiInterceptor` from the interceptor list in
 * `app.config.ts` — no service or component changes required.
 */
export const mockApiInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(API_PREFIX)) {
    return next(req);
  }

  const store = inject(MockStore);
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? null;
  const userId = store.userIdFromToken(token);

  try {
    const body = handle(store, req, userId);
    return of(new HttpResponse({ status: 200, body })).pipe(delay(MOCK_LATENCY_MS));
  } catch (error) {
    const apiError = error instanceof MockApiError ? error : new MockApiError('Something went wrong.', 500);
    return throwError(
      () =>
        new HttpErrorResponse({
          status: apiError.status,
          statusText: 'Error',
          error: { message: apiError.message },
          url: req.url,
        }),
    ).pipe(delay(MOCK_LATENCY_MS));
  }
};

interface MockRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  payload: Record<string, unknown>;
}

function handle(store: MockStore, req: Parameters<HttpInterceptorFn>[0], userId: number): unknown {
  const path = req.url.split('?')[0].replace(API_PREFIX, '');
  const query: Record<string, string> = {};
  for (const key of req.params.keys()) {
    query[key] = req.params.get(key) ?? '';
  }
  const payload = (req.body ?? {}) as Record<string, unknown>;
  const method = req.method.toUpperCase();
  const request: MockRequest = { method, path, query, payload };

  const segments = path.split('/').filter(Boolean);

  // ------------------------------------------------------------- auth
  if (path === '/auth/send-otp' && method === 'POST') {
    return store.sendOtp(String(payload['phoneNumber'] ?? ''));
  }
  if (path === '/auth/verify-otp' && method === 'POST') {
    return store.verifyOtp(String(payload['phoneNumber'] ?? ''), String(payload['otp'] ?? ''));
  }
  if (path === '/auth/complete-profile' && method === 'POST') {
    return { success: true, user: store.completeProfile(userId, payload as never) };
  }
  if (path === '/auth/me' && method === 'GET') {
    requireAuth(userId);
    return { user: store.getUser(userId) };
  }
  if (path === '/auth/logout' && method === 'POST') {
    return { success: true };
  }

  // ---------------------------------------------------------- profile
  if (path === '/me/profile' && method === 'PUT') {
    requireAuth(userId);
    return { success: true, user: store.updateUser(userId, payload as never) };
  }
  if (path === '/me/contact/send-otp' && method === 'POST') {
    requireAuth(userId);
    return store.sendContactOtp(userId, payload['kind'] === 'email' ? 'email' : 'phone', String(payload['value'] ?? ''));
  }
  if (path === '/me/contact/verify' && method === 'POST') {
    requireAuth(userId);
    return {
      success: true,
      user: store.verifyContactOtp(
        userId,
        payload['kind'] === 'email' ? 'email' : 'phone',
        String(payload['value'] ?? ''),
        String(payload['otp'] ?? ''),
      ),
    };
  }
  if (path === '/me/wallet' && method === 'GET') {
    requireAuth(userId);
    return store.getWallet(userId);
  }
  if (path === '/me/wallet/transactions' && method === 'GET') {
    requireAuth(userId);
    return store.getWalletTransactions(userId);
  }

  // --------------------------------------------------------- catalog
  if (path === '/movies' && method === 'GET') {
    return store.getMovies(query);
  }
  if (path === '/search' && method === 'GET') {
    return store.search(query);
  }
  if (segments[0] === 'movies' && segments[2] === 'showtimes' && method === 'GET') {
    return store.getShowtimes(Number(segments[1]), query);
  }
  if (segments[0] === 'theatres' && segments[2] === 'showtimes' && method === 'GET') {
    return store.getTheatreShows(Number(segments[1]));
  }
  if (segments[0] === 'showtimes' && segments[2] === 'seats' && method === 'GET') {
    return store.getSeats(Number(segments[1]));
  }
  if (segments[0] === 'showtimes' && method === 'GET') {
    return { showtime: store.getShowtime(Number(segments[1])) };
  }

  // -------------------------------------------------------- bookings
  if (path === '/bookings' && method === 'POST') {
    requireAuth(userId);
    return store.createBooking(userId, payload as never);
  }
  if (path === '/my-bookings' && method === 'GET') {
    requireAuth(userId);
    return store.getBookings(userId, query);
  }
  if (segments[0] === 'bookings' && segments[2] === 'share' && method === 'POST') {
    requireAuth(userId);
    const body = payload as { seatNumbers?: string[]; phoneNumber?: string };
    return store.shareSeats(userId, Number(segments[1]), body.seatNumbers ?? [], body.phoneNumber ?? '');
  }
  if (segments[0] === 'bookings' && segments[2] === 'cancel' && method === 'POST') {
    requireAuth(userId);
    return store.cancelBooking(userId, Number(segments[1]));
  }
  if (segments[0] === 'bookings' && method === 'GET') {
    requireAuth(userId);
    return { booking: store.getBooking(userId, Number(segments[1])) };
  }

  // ---------------------------------------------------------- resale
  if (path === '/resale-tickets' && method === 'POST') {
    requireAuth(userId);
    return store.createResaleTicket(userId, payload as never);
  }
  if (path === '/resale-tickets' && method === 'GET') {
    return store.getResaleTickets(query);
  }
  if (path === '/resale-tickets/my-listings' && method === 'GET') {
    requireAuth(userId);
    return store.getMyListings(userId);
  }
  if (path === '/resale-tickets/pricing-guidance' && method === 'GET') {
    requireAuth(userId);
    return store.getPricingGuidance(
      Number(query['bookingId']),
      userId,
      query['seatCount'] ? Number(query['seatCount']) : undefined,
    );
  }
  if (segments[0] === 'resale-tickets' && method === 'GET') {
    return { ticket: store.getResaleTicket(Number(segments[1])) };
  }
  if (segments[0] === 'resale-tickets' && method === 'PUT') {
    requireAuth(userId);
    return store.updateResaleTicket(userId, Number(segments[1]), payload as never);
  }
  if (segments[0] === 'resale-tickets' && method === 'DELETE') {
    requireAuth(userId);
    return store.delistResaleTicket(userId, Number(segments[1]));
  }
  if (path === '/resale-transactions' && method === 'POST') {
    requireAuth(userId);
    return store.createTransaction(
      userId,
      Number(payload['resaleTicketId']),
      payload['seatNumbers'] as string[] | undefined,
      payload['useWallet'] === true,
    );
  }
  if (path === '/my-transactions' && method === 'GET') {
    requireAuth(userId);
    return store.getTransactions(userId);
  }

  // ---------------------------------------------------------- reviews
  if (path === '/reviews' && method === 'POST') {
    requireAuth(userId);
    return store.addReview(userId, payload as never);
  }
  if (segments[0] === 'reviews' && method === 'GET') {
    return store.getReviews(Number(segments[1]));
  }

  // ----------------------------------------------------- notifications
  if (path === '/notifications' && method === 'GET') {
    requireAuth(userId);
    return store.getNotifications(userId);
  }
  if (path === '/notifications/read-all' && method === 'PUT') {
    requireAuth(userId);
    return store.markAllNotificationsRead(userId);
  }
  if (segments[0] === 'notifications' && segments[2] === 'read' && method === 'PUT') {
    requireAuth(userId);
    return store.markNotificationRead(userId, Number(segments[1]));
  }

  // ----------------------------------------------------------- users
  if (segments[0] === 'users' && method === 'GET') {
    return store.getProfile(Number(segments[1]));
  }

  throw new MockApiError(`No mock handler for ${method} ${path}`, 404);
}

function requireAuth(userId: number): void {
  if (!userId) {
    throw new MockApiError('You need to sign in to continue.', 401);
  }
}
