import { Injectable } from '@angular/core';

import {
  BOOKINGS,
  MOVIES,
  NOTIFICATIONS,
  RESALE_TICKETS,
  RESALE_TRANSACTIONS,
  REVIEWS,
  SHOWTIMES,
  THEATERS,
  USERS,
  WALLET_LEDGER,
  pseudoBookedSeat,
  SEAT_CATEGORIES,
  seatLayoutFor,
  categoryUnitPrice,
  seatUnitPrice,
  splitByListPrice,
} from './mock-seed';
import {
  daysBetween,
  dateKey,
  hashCode,
  isoDaysAgo,
  isoNow,
  randomConfirmationCode,
  round2,
  splitName,
} from './mock-utils';

import {
  BOOKING_COMMISSION_PER_TICKET,
  Booking,
  BookingDetail,
  CancelBookingResponse,
  ShareSeatsResponse,
} from '../models/booking.model';
import {
  Movie,
  MovieListResponse,
  Seat,
  SeatCategory,
  SeatMap,
  SeatMapResponse,
  Showtime,
  SearchResponse,
  ShowtimeListResponse,
  TheatreShowsResponse,
  languagesOf,
  ShowtimeWithRefs,
  Theater,
} from '../models/catalog.model';
import {
  CreateTransactionResponse,
  MyListingsResponse,
  PricingGuidance,
  ResaleListResponse,
  ResaleStatus,
  ResaleTicket,
  ResaleTicketDetail,
  ResaleTransaction,
  TransactionListResponse,
} from '../models/resale.model';
import { BOOKING_CANCEL_HOURS } from './booking-rules';
import { LISTING_CUTOFF_MINUTES, MIN_PRICE_SHARE, SELLER_KEEPS, resaleBuyerFee } from './resale-rules';
import {
  AppNotification,
  CreateReviewRequest,
  NotificationListResponse,
  Review,
  ReviewListResponse,
  ReviewType,
} from '../models/social.model';
import {
  CompleteProfileRequest,
  OtpChallengeResponse,
  PublicProfile,
  User,
  UserType,
  VerifyOtpResponse,
  WalletEntriesResponse,
  WalletEntry,
  WalletSummary,
} from '../models/user.model';

interface OtpEntry {
  code: string;
  expiresAt: number;
  attempts: number;
  /** For a contact change: the new number or email the code was sent to. */
  target?: string;
}

export class MockApiError extends Error {
  constructor(
    override readonly message: string,
    readonly status: number,
  ) {
    super(message);
  }
}


/** Part of the day a show starts in: Morning before 12, Afternoon 12-4, Evening 4-8, Night after 8. */
function timingOf(dateTime: string): string {
  const hour = new Date(dateTime).getHours();
  if (hour >= 5 && hour < 12) {
    return 'Morning';
  }
  if (hour >= 12 && hour < 16) {
    return 'Afternoon';
  }
  if (hour >= 16 && hour < 20) {
    return 'Evening';
  }
  return 'Night';
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * In-memory implementation of the ThiraiHub API described in REQUIREMENTS.md.
 *
 * The real backend (ASP.NET Core + SQL Server) is not part of this repository
 * yet, so the frontend talks to this store through an HTTP interceptor. Every
 * service in the app is written against the real REST contract, which means
 * switching to the production API is a matter of removing the interceptor.
 */
@Injectable({ providedIn: 'root' })
export class MockStore {
  readonly movies: Movie[] = clone(MOVIES);
  readonly theaters: Theater[] = clone(THEATERS);
  readonly showtimes: Showtime[] = clone(SHOWTIMES);
  readonly users: User[] = clone(USERS);
  bookings: Booking[] = clone(BOOKINGS);
  resaleTickets: ResaleTicket[] = clone(RESALE_TICKETS);
  resaleTransactions: ResaleTransaction[] = clone(RESALE_TRANSACTIONS);
  reviews: Review[] = clone(REVIEWS);
  notifications: AppNotification[] = clone(NOTIFICATIONS);
  walletLedger: WalletEntry[] = clone(WALLET_LEDGER);

  private readonly otpStore = new Map<string, OtpEntry>();
  private nextWalletEntryId = 1000;
  private nextUserId = 100;
  private nextBookingId = 700;
  private nextResaleId = 1000;
  private nextTransactionId = 800;
  private nextReviewId = 100;
  private nextRequestId = 100;
  private nextMatchId = 100;
  private nextNotificationId = 100;

  // ------------------------------------------------------------- auth

  sendOtp(phoneNumber: string): OtpChallengeResponse {
    const code = '123456';
    const normalized = this.normalizePhone(phoneNumber);
    this.otpStore.set(normalized, {
      code,
      expiresAt: Date.now() + 10 * 60 * 1000,
      attempts: 0,
    });
    return {
      success: true,
      message: `OTP sent to ${phoneNumber}. It expires in 10 minutes.`,
      expiresIn: 600,
      devOtp: code,
    };
  }

  verifyOtp(phoneNumber: string, otp: string): VerifyOtpResponse {
    const normalized = this.normalizePhone(phoneNumber);
    const entry = this.otpStore.get(normalized);
    if (!entry) {
      throw new MockApiError('Request a new OTP to continue.', 400);
    }
    if (entry.expiresAt < Date.now()) {
      this.otpStore.delete(normalized);
      throw new MockApiError('OTP expired. Please request a new one.', 400);
    }
    if (entry.attempts >= 3) {
      throw new MockApiError('Too many attempts. Request a new OTP.', 429);
    }
    if (entry.code !== otp.trim()) {
      entry.attempts += 1;
      throw new MockApiError('Incorrect OTP. Please try again.', 400);
    }

    this.otpStore.delete(normalized);
    let user = this.users.find((candidate) => candidate.phoneNumber === normalized);
    const isNewUser = !user;

    if (!user) {
      user = this.createUser(normalized);
    }

    return {
      token: this.createToken(user.id),
      isNewUser,
      user: clone(user),
    };
  }

  completeProfile(userId: number, body: CompleteProfileRequest): User {
    const user = this.requireUser(userId);
    user.firstName = body.firstName?.trim() ?? user.firstName;
    user.lastName = body.lastName?.trim() ?? user.lastName;
    user.fullName = `${user.firstName} ${user.lastName}`.trim() || user.fullName || 'ThiraiHub Member';
    if (body.birthday !== undefined) {
      user.birthday = body.birthday;
    }
    user.email = body.email?.trim() ? body.email.trim() : null;
    user.city = body.city || user.city;
    user.userType = body.userType ?? user.userType;
    if (body.bio !== undefined && body.bio !== null) {
      user.bio = body.bio;
    }
    if (body.interests) {
      user.interests = body.interests;
    }
    user.isPhoneVerified = true;
    return clone(user);
  }

  /**
   * Starts changing the signed-in user's mobile number or email: a code goes to the new one, and the
   * change only happens once that code is verified.
   */
  sendContactOtp(userId: number, kind: 'phone' | 'email', value: string): OtpChallengeResponse {
    const user = this.requireUser(userId);
    const target = this.cleanContact(kind, value);

    if (kind === 'phone') {
      if (target === user.phoneNumber) {
        throw new MockApiError('That is already your number.', 400);
      }
      if (this.users.some((candidate) => candidate.id !== userId && candidate.phoneNumber === target)) {
        throw new MockApiError('That number is already used by another account.', 409);
      }
    } else if (target === (user.email ?? '').toLowerCase()) {
      throw new MockApiError('That is already your email.', 400);
    }

    this.otpStore.set(`contact:${userId}:${kind}`, {
      code: '123456',
      expiresAt: Date.now() + 10 * 60 * 1000,
      attempts: 0,
      target,
    });
    return {
      success: true,
      message: `OTP sent to ${kind === 'phone' ? value : target}. It expires in 10 minutes.`,
      expiresIn: 600,
      devOtp: '123456',
    };
  }

  /** Completes the change started by sendContactOtp and returns the updated user. */
  verifyContactOtp(userId: number, kind: 'phone' | 'email', value: string, otp: string): User {
    const user = this.requireUser(userId);
    const key = `contact:${userId}:${kind}`;
    const entry = this.otpStore.get(key);
    const target = this.cleanContact(kind, value);

    if (!entry || entry.target !== target) {
      throw new MockApiError('Request a new OTP to continue.', 400);
    }
    if (entry.expiresAt < Date.now()) {
      this.otpStore.delete(key);
      throw new MockApiError('OTP expired. Please request a new one.', 400);
    }
    if (entry.attempts >= 3) {
      throw new MockApiError('Too many attempts. Request a new OTP.', 429);
    }
    if (entry.code !== otp.trim()) {
      entry.attempts += 1;
      throw new MockApiError('Incorrect OTP. Please try again.', 400);
    }

    this.otpStore.delete(key);
    if (kind === 'phone') {
      user.phoneNumber = target;
    } else {
      user.email = target;
    }
    return clone(user);
  }

  getUser(userId: number): User {
    return clone(this.requireUser(userId));
  }

  updateUser(userId: number, body: Partial<User>): User {
    const user = this.requireUser(userId);
    if (body.firstName !== undefined || body.lastName !== undefined) {
      user.firstName = (body.firstName ?? user.firstName).trim();
      user.lastName = (body.lastName ?? user.lastName).trim();
      user.fullName = `${user.firstName} ${user.lastName}`.trim();
    } else if (body.fullName !== undefined) {
      user.fullName = body.fullName;
      [user.firstName, user.lastName] = splitName(body.fullName);
    }
    if (body.birthday !== undefined) {
      user.birthday = body.birthday;
    }
    if (body.profileImageUrl !== undefined) {
      user.profileImageUrl = body.profileImageUrl;
    }
    if (body.email !== undefined) {
      user.email = body.email;
    }
    if (body.city !== undefined) {
      user.city = body.city;
    }
    if (body.bio !== undefined) {
      user.bio = body.bio;
    }
    if (body.interests !== undefined) {
      user.interests = body.interests;
    }
    if (body.userType !== undefined) {
      user.userType = body.userType;
    }
    return clone(user);
  }

  getProfile(userId: number): PublicProfile {
    const user = this.requireUser(userId);
    const userBookings = this.bookings.filter((booking) => booking.userId === userId);
    const userSales = this.resaleTransactions.filter(
      (transaction) => transaction.sellerId === userId && transaction.status === 'Completed',
    );

    return {
      user: clone(user),
      stats: {
        totalBookings: userBookings.length,
        totalSales: userSales.length,
        totalEarned: user.totalEarned,
        verifiedSeller: user.sellerReviewCount >= 5 && user.sellerRating >= 4,
        memberSince: user.createdAt,
      },
      reviews: clone(this.reviews.filter((review) => review.revieweeId === userId)),
    };
  }

  getWallet(userId: number): WalletSummary {
    const user = this.requireUser(userId);
    return {
      balance: round2(user.walletBalance),
      totalEarned: round2(user.totalEarned),
      lifetimeSales: this.resaleTransactions.filter((t) => t.sellerId === userId).length,
    };
  }

  /** The signed-in user's wallet history, newest first. */
  getWalletTransactions(userId: number): WalletEntriesResponse {
    this.requireUser(userId);
    const entries = this.walletLedger
      .filter((entry) => entry.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
    return { entries: clone(entries) };
  }

  /**
   * Adds to (credit/refund) or takes from (debit) a user's walletBalance and records a ledger entry.
   * The balance is rounded and never goes below zero; a debit larger than the balance is clamped.
   * Returns the amount actually moved.
   */
  private applyWallet(
    userId: number,
    type: WalletEntry['type'],
    amount: number,
    reason: string,
    reference: WalletEntry['reference'],
  ): number {
    const user = this.requireUser(userId);
    const wanted = Math.max(0, round2(amount));
    const moved = type === 'debit' ? Math.min(wanted, round2(user.walletBalance)) : wanted;
    if (moved <= 0) {
      return 0;
    }
    user.walletBalance = Math.max(0, round2(user.walletBalance + (type === 'debit' ? -moved : moved)));
    this.walletLedger.push({
      id: this.nextWalletEntryId++,
      userId,
      type,
      amount: moved,
      balanceAfter: user.walletBalance,
      reason,
      reference,
      createdAt: isoNow(),
    });
    return moved;
  }

  // ---------------------------------------------------------- catalog

  /** Shows that have not started yet; the ones already running stay out of every browse list. */
  private browsableShowtimes(): Showtime[] {
    const now = Date.now();
    return this.showtimes.filter((showtime) => new Date(showtime.showDateTime).getTime() > now);
  }

  getMovies(query: Record<string, string>): MovieListResponse {
    const city = query['city'];
    const genre = query['genre'];
    const language = query['language'];
    const date = query['date'];
    const timing = query['timing'];
    const search = (query['search'] ?? '').trim().toLowerCase();

    let movieIds = new Set(this.browsableShowtimes().map((showtime) => showtime.movieId));

    if (city) {
      const theaterIds = new Set(
        this.theaters.filter((theater) => theater.city === city).map((theater) => theater.id),
      );
      const cityMovieIds = new Set(
        this.browsableShowtimes()
          .filter((showtime) => theaterIds.has(showtime.theaterId))
          .map((showtime) => showtime.movieId),
      );
      movieIds = new Set([...movieIds].filter((id) => cityMovieIds.has(id)));
    }

    if (date) {
      const ids = new Set(
        this.browsableShowtimes()
          .filter((showtime) => dateKey(showtime.showDateTime) === date)
          .map((showtime) => showtime.movieId),
      );
      movieIds = new Set([...movieIds].filter((id) => ids.has(id)));
    }

    if (timing && timing !== 'All') {
      const cityTheaterIds = city
        ? new Set(this.theaters.filter((theater) => theater.city === city).map((theater) => theater.id))
        : null;
      const ids = new Set(
        this.browsableShowtimes()
          .filter(
            (showtime) =>
              (cityTheaterIds === null || cityTheaterIds.has(showtime.theaterId)) &&
              timingOf(showtime.showDateTime) === timing,
          )
          .map((showtime) => showtime.movieId),
      );
      movieIds = new Set([...movieIds].filter((id) => ids.has(id)));
    }

    let movies = this.movies.filter((movie) => movieIds.has(movie.id));

    if (genre && genre !== 'All') {
      movies = movies.filter((movie) => movie.genre.toLowerCase().includes(genre.toLowerCase()));
    }
    if (language && language !== 'All') {
      movies = movies.filter((movie) => languagesOf(movie).includes(language));
    }
    if (search) {
      // Movies playing at a theatre whose name or address matches (within the chosen city).
      const matchingTheaterIds = new Set(
        this.theaters
          .filter(
            (theater) =>
              (!city || theater.city === city) &&
              `${theater.name} ${theater.address}`.toLowerCase().includes(search),
          )
          .map((theater) => theater.id),
      );
      const theaterMovieIds = new Set(
        this.browsableShowtimes()
          .filter((showtime) => matchingTheaterIds.has(showtime.theaterId))
          .map((showtime) => showtime.movieId),
      );

      movies = movies.filter(
        (movie) =>
          movie.title.toLowerCase().includes(search) ||
          movie.genre.toLowerCase().includes(search) ||
          movie.tags.some((tag) => tag.toLowerCase().includes(search)) ||
          theaterMovieIds.has(movie.id),
      );
    }

    const genres = new Set<string>();
    this.movies.forEach((movie) =>
      movie.genre.split(',').forEach((entry) => genres.add(entry.trim())),
    );

    return {
      movies: clone(movies),
      genres: [...genres].sort(),
      cities: this.theaters.map((theater) => theater.city).filter((value, index, all) => all.indexOf(value) === index),
      languages: [...new Set(this.movies.flatMap((movie) => languagesOf(movie)))].sort(),
    };
  }

  /** Movies (title, genre, language, tag) and theatres (name, address) in a city. An empty query lists everything. */
  search(query: Record<string, string>): SearchResponse {
    const city = query['city'];
    const text = (query['q'] ?? '').trim().toLowerCase();

    const theaters = this.theaters.filter((theater) => !city || theater.city === city);
    const theaterIds = new Set(theaters.map((theater) => theater.id));
    const playing = this.browsableShowtimes().filter((showtime) => theaterIds.has(showtime.theaterId));
    const playingMovieIds = new Set(playing.map((showtime) => showtime.movieId));

    const movies = this.movies.filter(
      (movie) =>
        playingMovieIds.has(movie.id) &&
        (!text ||
          [movie.title, movie.genre, movie.language, ...movie.tags].some((value) =>
            value.toLowerCase().includes(text),
          )),
    );

    const matchedTheaters = theaters
      .filter((theater) => !text || `${theater.name} ${theater.address}`.toLowerCase().includes(text))
      .map((theater) => {
        const movieIds = new Set(
          playing.filter((showtime) => showtime.theaterId === theater.id).map((showtime) => showtime.movieId),
        );
        return {
          ...theater,
          movies: this.movies
            .filter((movie) => movieIds.has(movie.id))
            .map((movie) => ({ id: movie.id, title: movie.title })),
        };
      });

    return clone({ movies, theaters: matchedTheaters });
  }

  /** Every upcoming show at one theatre, across all films, and the days they fall on. */
  getTheatreShows(theaterId: number): TheatreShowsResponse {
    const theater = this.theaters.find((candidate) => candidate.id === theaterId);
    if (!theater) {
      throw new MockApiError('That theatre could not be found.', 404);
    }
    const showtimes = this.browsableShowtimes()
      .filter((showtime) => showtime.theaterId === theaterId)
      .map((showtime) => this.withRefs(showtime))
      .filter((showtime): showtime is ShowtimeWithRefs => showtime !== null);
    const dates = [...new Set(showtimes.map((showtime) => dateKey(showtime.showDateTime)))].sort();
    return clone({ theater, showtimes, dates });
  }

  getShowtimes(movieId: number, query: Record<string, string>): ShowtimeListResponse {
    const theaterId = query['theaterId'];
    const date = query['date'];
    const format = query['format'];
    const city = query['city'];
    const language = query['language'];

    let showtimes = this.browsableShowtimes().filter((showtime) => showtime.movieId === movieId);
    if (city) {
      const cityTheaterIds = new Set(
        this.theaters.filter((theater) => theater.city === city).map((theater) => theater.id),
      );
      showtimes = showtimes.filter((showtime) => cityTheaterIds.has(showtime.theaterId));
    }
    if (theaterId) {
      showtimes = showtimes.filter((showtime) => showtime.theaterId === Number(theaterId));
    }
    if (date) {
      showtimes = showtimes.filter((showtime) => dateKey(showtime.showDateTime) === date);
    }
    if (format && format !== 'All') {
      showtimes = showtimes.filter((showtime) => showtime.format === format);
    }
    if (language) {
      showtimes = showtimes.filter((showtime) => showtime.language === language);
    }

    const enriched = showtimes
      .map((showtime) => this.withRefs(showtime))
      .filter((showtime): showtime is ShowtimeWithRefs => showtime !== null);

    const theaterIds = new Set(enriched.map((showtime) => showtime.theaterId));
    const theaters = this.theaters.filter((theater) => theaterIds.has(theater.id));
    const dates = [...new Set(enriched.map((showtime) => dateKey(showtime.showDateTime)))].sort();

    return {
      showtimes: clone(enriched),
      theaters: clone(theaters),
      formats: [...new Set(this.browsableShowtimes().map((showtime) => showtime.format))],
      dates,
    };
  }

  getShowtime(showtimeId: number): ShowtimeWithRefs {
    const showtime = this.showtimes.find((candidate) => candidate.id === showtimeId);
    if (!showtime) {
      throw new MockApiError('Showtime not found.', 404);
    }
    const enriched = this.withRefs(showtime);
    if (!enriched) {
      throw new MockApiError('Showtime not found.', 404);
    }
    return clone(enriched);
  }

  getSeats(showtimeId: number): SeatMapResponse {
    const showtime = this.showtimes.find((candidate) => candidate.id === showtimeId);
    if (!showtime) {
      throw new MockApiError('Showtime not found.', 404);
    }

    const bookedForShowtime = new Set(
      this.bookings
        .filter((booking) => booking.showtimeId === showtimeId && booking.status === 'Completed')
        .flatMap((booking) => booking.seatNumbers),
    );

    const rows = seatLayoutFor(showtimeId).map(({ label, category: rowCategory, seats: seatCount }) => {
      const category = rowCategory as SeatCategory;
      const seats: Seat[] = [];
      for (let number = 1; number <= seatCount; number++) {
        const id = `${label}${number}`;
        const price = categoryUnitPrice(showtime.basePrice, category);
        const status = bookedForShowtime.has(id)
          ? 'Booked'
          : pseudoBookedSeat(showtimeId, id)
            ? 'Booked'
            : 'Available';
        seats.push({ id, row: label, number, category, price, status });
      }
      return { label, category, seats };
    });

    const seatMap: SeatMap = { rows, screenLabel: 'All eyes this way' };
    const availableSeats = rows.reduce(
      (total, row) => total + row.seats.filter((seat) => seat.status === 'Available').length,
      0,
    );

    return {
      seatMap,
      availableSeats,
      basePrice: showtime.basePrice,
      categories: [...new Set(rows.map((row) => row.category))].map((name) => ({
        name,
        price: categoryUnitPrice(showtime.basePrice, name),
      })),
    };
  }

  // --------------------------------------------------------- bookings

  createBooking(
    userId: number,
    body: { showtimeId: number; seatNumbers: string[]; useWallet?: boolean },
  ): {
    bookingId: number;
    confirmationCode: string;
    qrCode: string;
    bookingPrice: number;
    commissionFee: number;
    totalAmount: number;
    walletUsed: number;
    amountDue: number;
  } {
    const showtime = this.showtimes.find((candidate) => candidate.id === body.showtimeId);
    if (!showtime) {
      throw new MockApiError('Showtime not found.', 404);
    }
    if (!body.seatNumbers?.length) {
      throw new MockApiError('Select at least one seat.', 400);
    }
    if (body.seatNumbers.length > 8) {
      throw new MockApiError('You can book up to 8 tickets at a time.', 400);
    }

    const seatMap = this.getSeats(showtime.id).seatMap;
    const allSeats = seatMap.rows.flatMap((row) => row.seats);
    const selected = allSeats.filter((seat) => body.seatNumbers.includes(seat.id));
    if (selected.length !== body.seatNumbers.length) {
      throw new MockApiError('One or more seats do not exist for this show.', 400);
    }
    const unavailable = selected.filter((seat) => seat.status !== 'Available');
    if (unavailable.length) {
      throw new MockApiError(
        `Seat ${unavailable.map((seat) => seat.id).join(', ')} is no longer available.`,
        409,
      );
    }

    const bookingPrice = round2(selected.reduce((total, seat) => total + seat.price, 0));
    const commissionFee = BOOKING_COMMISSION_PER_TICKET * selected.length;
    const booking: Booking = {
      id: this.nextBookingId++,
      showtimeId: showtime.id,
      userId,
      quantity: selected.length,
      seatNumbers: selected.map((seat) => seat.id),
      bookingPrice,
      commissionFee,
      totalAmount: round2(bookingPrice + commissionFee),
      paymentId: `pi_mock_${Date.now()}`,
      status: 'Completed',
      qrCode: '',
      confirmationCode: randomConfirmationCode('SH'),
      bookedAt: isoNow(),
      cancelledAt: null,
    };
    booking.qrCode = `THIRAIHUB:${booking.confirmationCode}`;

    const walletUsed = body.useWallet
      ? this.applyWallet(userId, 'debit', booking.totalAmount, `Booking ${booking.confirmationCode}`, {
          kind: 'booking',
          id: booking.id,
        })
      : 0;
    if (walletUsed > 0) {
      booking.walletPaid = walletUsed;
    }

    this.bookings.unshift(booking);
    this.pushNotification({
      type: 'booking',
      title: 'Booking confirmed',
      body: `${booking.quantity} ticket${booking.quantity > 1 ? 's' : ''} for ${this.withRefs(showtime)!.movie.title} confirmed.`,
      link: '/my-bookings',
    });

    return {
      bookingId: booking.id,
      confirmationCode: booking.confirmationCode!,
      qrCode: booking.qrCode!,
      bookingPrice,
      commissionFee,
      totalAmount: booking.totalAmount,
      walletUsed,
      amountDue: round2(booking.totalAmount - walletUsed),
    };
  }

  getBookings(userId: number, query: Record<string, string>): { bookings: BookingDetail[]; total: number } {
    this.closeUnsoldListings();
    const status = query['status'];
    const page = Math.max(1, Number(query['page'] ?? 1));
    const pageSize = 20;

    let bookings = this.bookings.filter((booking) => booking.userId === userId);
    if (status && status !== 'All') {
      bookings = bookings.filter((booking) => booking.status === status);
    }
    bookings = [...bookings].sort(
      (a, b) => new Date(b.bookedAt).getTime() - new Date(a.bookedAt).getTime(),
    );

    const paged = bookings.slice((page - 1) * pageSize, page * pageSize);
    return {
      bookings: paged.map((booking) => this.toBookingDetail(booking)).map(clone),
      total: bookings.length,
    };
  }

  getBooking(userId: number, bookingId: number): BookingDetail {
    const booking = this.bookings.find((candidate) => candidate.id === bookingId);
    if (!booking || booking.userId !== userId) {
      throw new MockApiError('Booking not found.', 404);
    }
    return clone(this.toBookingDetail(booking));
  }

  /**
   * Gives some seats of a booking to someone else: they move into a new booking on the other person's account, and the
   * price paid for them moves with them. The owner keeps at least one seat. Seats on the resale market cannot be shared.
   */
  shareSeats(userId: number, bookingId: number, seatNumbers: string[], phoneNumber: string): ShareSeatsResponse {
    const booking = this.bookings.find((candidate) => candidate.id === bookingId);
    if (!booking || booking.userId !== userId) {
      throw new MockApiError('Booking not found.', 404);
    }
    if (booking.status !== 'Completed') {
      throw new MockApiError('Only confirmed bookings can be shared.', 400);
    }
    const showtime = this.showtimes.find((candidate) => candidate.id === booking.showtimeId)!;
    if (new Date(showtime.showDateTime).getTime() <= Date.now()) {
      throw new MockApiError('This show has already started.', 409);
    }

    const seats = [...new Set(seatNumbers)];
    if (seats.length === 0) {
      throw new MockApiError('Pick at least one seat to share.', 400);
    }
    const mine = this.unlistedSeatsOf(booking);
    if (!seats.every((seat) => mine.includes(seat))) {
      throw new MockApiError('Pick seats that are still yours and not listed for sale.', 400);
    }
    if (seats.length >= booking.seatNumbers.length) {
      throw new MockApiError('Keep at least one seat in this booking.', 400);
    }

    const phone = this.cleanContact('phone', phoneNumber);
    const recipient = this.users.find((candidate) => candidate.phoneNumber === phone);
    if (!recipient) {
      throw new MockApiError('No ThiraiHub account uses this number yet.', 404);
    }
    if (recipient.id === userId) {
      throw new MockApiError('That is your own number.', 400);
    }
    const sender = this.users.find((candidate) => candidate.id === userId);

    // The price paid is split evenly per seat; the seats that leave take their share with them.
    const total = booking.seatNumbers.length;
    const share = seats.length / total;
    const moved = {
      bookingPrice: round2(booking.bookingPrice * share),
      commissionFee: round2(booking.commissionFee * share),
    };

    const received: Booking = {
      id: this.nextBookingId++,
      showtimeId: booking.showtimeId,
      userId: recipient.id,
      quantity: seats.length,
      seatNumbers: seats,
      bookingPrice: moved.bookingPrice,
      commissionFee: moved.commissionFee,
      totalAmount: round2(moved.bookingPrice + moved.commissionFee),
      paymentId: booking.paymentId,
      status: 'Completed',
      qrCode: '',
      confirmationCode: randomConfirmationCode('SH'),
      bookedAt: isoNow(),
      cancelledAt: null,
      fromResale: booking.fromResale,
      sharedBy: sender?.fullName || 'A friend',
    };
    received.qrCode = `THIRAIHUB:${received.confirmationCode}`;
    this.bookings.unshift(received);

    booking.seatNumbers = booking.seatNumbers.filter((seat) => !seats.includes(seat));
    booking.quantity = booking.seatNumbers.length;
    booking.bookingPrice = round2(booking.bookingPrice - moved.bookingPrice);
    booking.commissionFee = round2(booking.commissionFee - moved.commissionFee);
    booking.totalAmount = round2(booking.bookingPrice + booking.commissionFee);
    if (booking.walletPaid) {
      booking.walletPaid = round2(booking.walletPaid * (1 - share));
    }

    const movieTitle = this.withRefs(showtime)!.movie.title;
    const name = recipient.fullName || 'your friend';
    this.pushNotification({
      type: 'booking',
      title: 'Seats shared',
      body: `${seats.join(', ')} for ${movieTitle} are now in ${name}'s account.`,
      link: `/my-bookings/${booking.id}`,
    });

    return {
      success: true,
      recipientName: name,
      seatNumbers: seats,
      message: `${seats.length === 1 ? 'Seat' : 'Seats'} ${seats.join(', ')} shared with ${name}.`,
    };
  }

  cancelBooking(userId: number, bookingId: number): CancelBookingResponse {
    const booking = this.bookings.find((candidate) => candidate.id === bookingId);
    if (!booking || booking.userId !== userId) {
      throw new MockApiError('Booking not found.', 404);
    }
    if (booking.status === 'Cancelled') {
      throw new MockApiError('This booking is already cancelled.', 400);
    }
    if (booking.sharedBy) {
      throw new MockApiError('Seats shared with you cannot be cancelled. You can sell them instead.', 400);
    }
    if (this.resaleTickets.some((ticket) => ticket.bookingId === booking.id && ticket.status === 'Available')) {
      throw new MockApiError('Delist these tickets from resale before cancelling.', 400);
    }

    const showtime = this.showtimes.find((candidate) => candidate.id === booking.showtimeId)!;
    const hoursUntilShow = (new Date(showtime.showDateTime).getTime() - Date.now()) / 3600000;
    if (hoursUntilShow < BOOKING_CANCEL_HOURS) {
      throw new MockApiError(`Bookings can only be cancelled up to ${BOOKING_CANCEL_HOURS} hours before the show.`, 400);
    }
    const refundPercent = hoursUntilShow >= 24 ? 50 : 0;
    const refundAmount = round2((booking.totalAmount * refundPercent) / 100);

    booking.status = 'Cancelled';
    booking.cancelledAt = isoNow();

    const refundToWallet = this.applyWallet(
      userId,
      'refund',
      Math.min(refundAmount, booking.walletPaid ?? 0),
      `Refund for booking ${booking.confirmationCode ?? booking.id}`,
      { kind: 'booking', id: booking.id },
    );
    const refundToCard = round2(refundAmount - refundToWallet);
    const parts: string[] = [];
    if (refundToWallet > 0) {
      parts.push(`₹${refundToWallet} to your wallet right away`);
    }
    if (refundToCard > 0) {
      parts.push(`₹${refundToCard} to your card in 5-7 working days`);
    }

    return {
      success: true,
      refundAmount,
      refundPercent,
      refundToWallet,
      refundToCard,
      message:
        refundPercent > 0
          ? `Cancelled successfully. ${refundPercent}% (₹${refundAmount}) is being refunded: ${parts.join(' and ')}.`
          : 'Cancelled successfully. Cancellations within 24 hours of showtime are not refundable.',
    };
  }

  // ----------------------------------------------------------- resale

  createResaleTicket(
    userId: number,
    body: {
      bookingId: number;
      /** One seat's price in each category, e.g. { Premium: 380, Regular: 240 }. */
      categoryPrices: Partial<Record<SeatCategory, number>>;
      allowPartial?: boolean;
      seatNumbers?: string[];
    },
  ): { resaleTicketId: number; listedAt: string; expiresAt: string; ticket: ResaleTicketDetail } {
    const booking = this.bookings.find((candidate) => candidate.id === body.bookingId);
    if (!booking || booking.userId !== userId) {
      throw new MockApiError('Booking not found.', 404);
    }
    if (booking.status !== 'Completed') {
      throw new MockApiError('Only confirmed bookings can be resold.', 400);
    }
    const open = this.unlistedSeatsOf(booking);
    if (open.length === 0) {
      throw new MockApiError('These tickets are already listed.', 400);
    }
    const seats = body.seatNumbers?.length ? [...new Set(body.seatNumbers)] : open;
    if (!seats.every((seat) => open.includes(seat))) {
      throw new MockApiError('Pick seats from this booking that are not already listed.', 400);
    }

    const showtime = this.showtimes.find((candidate) => candidate.id === booking.showtimeId)!;
    if (new Date(showtime.showDateTime).getTime() - Date.now() < LISTING_CUTOFF_MINUTES * 60_000) {
      throw new MockApiError(`Listings close ${LISTING_CUTOFF_MINUTES} minutes before the show.`, 400);
    }

    const info = this.seatInfoFor(booking);
    const seatPrices: Record<string, number> = {};
    for (const seat of seats) {
      const { category, paid } = info[seat];
      const price = body.categoryPrices?.[category];
      if (price === undefined || !Number.isFinite(price) || price < 1) {
        throw new MockApiError(`Enter a price of at least ₹1 for ${category} seats.`, 400);
      }
      if (price > paid) {
        throw new MockApiError(`A ${category} seat cost ₹${paid}, so it can't be priced higher.`, 400);
      }
      seatPrices[seat] = round2(price);
    }
    const resalePrice = round2(Object.values(seatPrices).reduce((total, price) => total + price, 0));
    const originalPrice = round2(seats.reduce((total, seat) => total + info[seat].paid, 0));

    const ticket: ResaleTicket = {
      id: this.nextResaleId++,
      bookingId: booking.id,
      sellerId: userId,
      buyerId: null,
      seatNumbers: seats,
      seatPrices,
      allowPartial: seats.length > 1 && !!body.allowPartial,
      listedSeatCount: seats.length,
      originalPrice,
      resalePrice,
      sellerCommission: round2(resalePrice * (1 - SELLER_KEEPS)),
      buyerFee: resaleBuyerFee(seats.length),
      sellerReceives: round2(resalePrice * SELLER_KEEPS),
      status: 'Available',
      listedAt: isoNow(),
      soldAt: null,
      expiresAt: showtime.showDateTime,
    };

    this.resaleTickets.unshift(ticket);
    return {
      resaleTicketId: ticket.id,
      listedAt: ticket.listedAt,
      expiresAt: ticket.expiresAt,
      ticket: clone(this.toResaleDetail(ticket)!),
    };
  }

  /**
   * A listing that is still unsold when its show starts becomes Expired (shown as "Unsold"). Its seats
   * are no longer on the market, so they are back in the seller's tickets. Runs before anything reads
   * listings, since the mock has no clock ticking in the background.
   */
  private closeUnsoldListings(): void {
    const now = Date.now();
    for (const listing of this.resaleTickets) {
      if (listing.status !== 'Available') {
        continue;
      }
      const booking = this.bookings.find((candidate) => candidate.id === listing.bookingId);
      const showtime = booking && this.showtimes.find((candidate) => candidate.id === booking.showtimeId);
      if (showtime && new Date(showtime.showDateTime).getTime() <= now) {
        listing.status = 'Expired';
      }
    }
  }

  getResaleTickets(query: Record<string, string>): ResaleListResponse {
    this.closeUnsoldListings();
    const movieId = query['movieId'];
    const theaterId = query['theaterId'];
    const minPrice = query['minPrice'] ? Number(query['minPrice']) : null;
    const maxPrice = query['maxPrice'] ? Number(query['maxPrice']) : null;
    const city = query['city'];
    const format = query['format'];
    const page = Math.max(1, Number(query['page'] ?? 1));
    const pageSize = 12;

    let tickets = this.resaleTickets.filter((ticket) => {
      if (ticket.status !== 'Available') {
        return false;
      }
      if (new Date(ticket.expiresAt).getTime() < Date.now()) {
        return false;
      }
      return true;
    });

    const enriched = tickets
      .map((ticket) => this.toResaleDetail(ticket))
      .filter((ticket): ticket is ResaleTicketDetail => ticket !== null);

    let filtered = enriched;
    if (movieId) {
      filtered = filtered.filter((ticket) => ticket.showtime.movieId === Number(movieId));
    }
    if (theaterId) {
      filtered = filtered.filter((ticket) => ticket.showtime.theaterId === Number(theaterId));
    }
    if (city) {
      filtered = filtered.filter((ticket) => ticket.showtime.theater.city === city);
    }
    if (format && format !== 'All') {
      filtered = filtered.filter((ticket) => ticket.showtime.format === format);
    }
    if (minPrice !== null) {
      filtered = filtered.filter((ticket) => ticket.resalePrice >= minPrice);
    }
    if (maxPrice !== null) {
      filtered = filtered.filter((ticket) => ticket.resalePrice <= maxPrice);
    }

    filtered = [...filtered].sort(
      (a, b) => new Date(a.showtime.showDateTime).getTime() - new Date(b.showtime.showDateTime).getTime(),
    );

    const prices = enriched.map((ticket) => ticket.resalePrice);
    const theaterMap = new Map<number, Theater>();
    enriched.forEach((ticket) => theaterMap.set(ticket.showtime.theaterId, ticket.showtime.theater));

    return {
      tickets: clone(filtered.slice((page - 1) * pageSize, page * pageSize)),
      filters: {
        minPrice: prices.length ? Math.floor(Math.min(...prices)) : 100,
        maxPrice: prices.length ? Math.ceil(Math.max(...prices)) : 600,
        genres: [...new Set(enriched.map((ticket) => ticket.showtime.movie.genre.split(',')[0].trim()))],
        theaters: clone([...theaterMap.values()]),
        cities: [...new Set(enriched.map((ticket) => ticket.showtime.theater.city))],
        formats: [...new Set(enriched.map((ticket) => ticket.showtime.format))],
      },
      total: filtered.length,
    };
  }

  getResaleTicket(ticketId: number): ResaleTicketDetail {
    this.closeUnsoldListings();
    const ticket = this.resaleTickets.find((candidate) => candidate.id === ticketId);
    if (!ticket) {
      throw new MockApiError('Ticket not found.', 404);
    }
    return clone(this.toResaleDetail(ticket)!);
  }

  getMyListings(userId: number): MyListingsResponse {
    this.closeUnsoldListings();
    const listings = this.resaleTickets
      .filter((ticket) => ticket.sellerId === userId)
      .map((ticket) => this.toResaleDetail(ticket))
      .filter((ticket): ticket is ResaleTicketDetail => ticket !== null)
      .map((ticket) => {
        const booking = this.bookings.find((candidate) => candidate.id === ticket.bookingId);
        const info = booking ? this.seatInfoFor(booking) : {};
        const seatDetails = ticket.seatNumbers.map((id) => ({
          id,
          category: info[id]?.category ?? ('Regular' as SeatCategory),
          paid: info[id]?.paid ?? 0,
          price: ticket.seatPrices[id],
        }));
        return { ...ticket, seatDetails };
      })
      .sort((a, b) => new Date(b.listedAt).getTime() - new Date(a.listedAt).getTime());

    const active = listings.filter((ticket) => ticket.status === 'Available').length;
    const sold = listings.filter((ticket) => ticket.status === 'Sold').length;
    const expired = listings.filter((ticket) => ticket.status === 'Expired' || ticket.status === 'Delisted').length;
    const earnings = listings
      .filter((ticket) => ticket.status === 'Sold')
      .reduce((total, ticket) => total + ticket.sellerReceives, 0);

    return {
      listings: clone(listings),
      stats: {
        active,
        sold,
        expired,
        earnings: round2(earnings),
      },
    };
  }

  updateResaleTicket(
    userId: number,
    ticketId: number,
    body: { price?: number; categoryPrices?: Partial<Record<SeatCategory, number>>; allowPartial?: boolean },
  ): { success: boolean; ticket: ResaleTicketDetail } {
    this.closeUnsoldListings();
    const ticket = this.resaleTickets.find((candidate) => candidate.id === ticketId);
    if (!ticket || ticket.sellerId !== userId) {
      throw new MockApiError('Listing not found.', 404);
    }
    if (ticket.status !== 'Available') {
      throw new MockApiError('Only active listings can be edited.', 400);
    }
    const booking = this.bookings.find((candidate) => candidate.id === ticket.bookingId)!;
    const info = this.seatInfoFor(booking);

    let seatPrices = ticket.seatPrices;
    let total = ticket.resalePrice;
    if (body.categoryPrices) {
      // Prices are set per category: every seat of a category gets that category's price.
      seatPrices = {};
      for (const seat of ticket.seatNumbers) {
        const price = round2(Number(body.categoryPrices[info[seat].category]));
        if (!price || price <= 0) {
          throw new MockApiError(`Enter a price for ${info[seat].category} seats.`, 400);
        }
        if (price > info[seat].paid) {
          throw new MockApiError(`A ${info[seat].category} seat cost ₹${info[seat].paid}, so it can't be priced higher.`, 400);
        }
        if (price < round2(info[seat].paid * MIN_PRICE_SHARE)) {
          throw new MockApiError('Price is too low.', 400);
        }
        seatPrices[seat] = price;
      }
      total = round2(ticket.seatNumbers.reduce((sum, seat) => sum + seatPrices[seat], 0));
    } else if (body.price !== undefined) {
      if (!body.price || body.price <= 0) {
        throw new MockApiError('Enter a valid selling price.', 400);
      }
      total = round2(body.price);
      if (total > ticket.originalPrice) {
        throw new MockApiError('Selling price cannot be higher than what you paid.', 400);
      }
      if (total < round2(ticket.originalPrice * MIN_PRICE_SHARE)) {
        throw new MockApiError('Price is too low.', 400);
      }
      seatPrices = this.rescale(ticket.seatPrices, ticket.seatNumbers, total);
      for (const seat of ticket.seatNumbers) {
        if (seatPrices[seat] > info[seat].paid) {
          throw new MockApiError(`A ${info[seat].category} seat cost ₹${info[seat].paid}, so it can't be priced higher.`, 400);
        }
      }
    }
    if (typeof body.allowPartial === 'boolean') {
      if (body.allowPartial && ticket.seatNumbers.length < 2) {
        throw new MockApiError('Seat-by-seat buying needs two or more seats.', 400);
      }
      ticket.allowPartial = body.allowPartial;
    }

    ticket.seatPrices = seatPrices;
    ticket.resalePrice = total;
    ticket.sellerCommission = round2(total * (1 - SELLER_KEEPS));
    ticket.sellerReceives = round2(total * SELLER_KEEPS);
    ticket.buyerFee = resaleBuyerFee(ticket.seatNumbers.length);

    return { success: true, ticket: clone(this.toResaleDetail(ticket)!) };
  }

  delistResaleTicket(userId: number, ticketId: number): { success: boolean } {
    this.closeUnsoldListings();
    const ticket = this.resaleTickets.find((candidate) => candidate.id === ticketId);
    if (!ticket || ticket.sellerId !== userId) {
      throw new MockApiError('Listing not found.', 404);
    }
    if (ticket.status !== 'Available') {
      throw new MockApiError('Only active listings can be delisted.', 400);
    }
    ticket.status = 'Delisted';
    return { success: true };
  }

  getPricingGuidance(bookingId: number, userId: number, seatCount?: number): PricingGuidance {
    const booking = this.bookings.find((candidate) => candidate.id === bookingId);
    if (!booking || booking.userId !== userId) {
      throw new MockApiError('Booking not found.', 404);
    }
    const showtime = this.showtimes.find((candidate) => candidate.id === booking.showtimeId)!;
    // Guidance is for the seats being sold: all of the booking's open seats unless a smaller number is given.
    const sellCount = Math.min(
      Math.max(1, seatCount ?? this.unlistedSeatsOf(booking).length),
      booking.seatNumbers.length,
    );
    const bookingPrice = round2((booking.bookingPrice * sellCount) / booking.seatNumbers.length);

    const competitors = this.resaleTickets
      .filter((ticket) => ticket.status === 'Available')
      .map((ticket) => this.toResaleDetail(ticket))
      .filter((ticket): ticket is ResaleTicketDetail => ticket !== null)
      .filter((ticket) => ticket.showtime.movieId === showtime.movieId)
      .filter((ticket) => ticket.bookingId !== booking.id);

    const perSeatOriginal = bookingPrice / sellCount;
    const competitorPerSeat = competitors.map((ticket) => ticket.resalePrice / ticket.seatNumbers.length);
    const marketAverage = competitorPerSeat.length
      ? round2(competitorPerSeat.reduce((total, price) => total + price, 0) / competitorPerSeat.length)
      : round2(perSeatOriginal * 0.8);

    const lowestPrice = competitorPerSeat.length ? Math.floor(Math.min(...competitorPerSeat)) : Math.floor(perSeatOriginal * 0.6);
    const highestPrice = competitorPerSeat.length ? Math.ceil(Math.max(...competitorPerSeat)) : Math.ceil(perSeatOriginal);

    const daysUntilShow = Math.max(0, daysBetween(new Date(), showtime.showDateTime));
    const urgencyFactor = daysUntilShow <= 1 ? 0.7 : daysUntilShow <= 3 ? 0.85 : 1;
    const competitionCount = competitors.length;
    const competitionPressure = Math.min(0.3, competitionCount * 0.05);

    const recommendedPrice = Math.min(
      bookingPrice,
      Math.max(
        50,
        Math.round((marketAverage * urgencyFactor - competitionPressure) * booking.quantity),
      ),
    );
    const recommendedMin = Math.max(50, Math.round(recommendedPrice * 0.9));
    const recommendedMax = Math.min(
      bookingPrice,
      Math.round(recommendedPrice * 1.12),
    );

    const probabilityBase = 0.55 + urgencyFactor * 0.3 - competitionPressure;
    const saleProbability = Math.round(Math.min(0.95, Math.max(0.15, probabilityBase)) * 100);

    const insights: string[] = [];
    insights.push(
      `You paid ₹${round2(perSeatOriginal)} per ticket; the market average is ₹${marketAverage}.`,
    );
    insights.push(
      daysUntilShow <= 1
        ? 'The show is within 24 hours — sellers typically price 15% lower to clear seats.'
        : `The show is ${daysUntilShow} day${daysUntilShow === 1 ? '' : 's'} away, so you have room to negotiate.`,
    );
    insights.push(
      competitionCount === 0
        ? 'No other sellers are listing this movie — you can price above the usual discount.'
        : `${competitionCount} other seller${competitionCount === 1 ? ' is' : 's are'} competing for the same show.`,
    );
    insights.push(
      saleProbability >= 65
        ? `Around ${saleProbability}% of listings at this price sell before showtime.`
        : `Only around ${saleProbability}% of listings sell quickly at this price — consider going lower.`,
    );

    // The market for one seat of each category: what other sellers ask for a seat of that category.
    const perCategory = Object.fromEntries(SEAT_CATEGORIES.map((category) => [category, [] as number[]])) as Record<
      SeatCategory,
      number[]
    >;
    for (const competitor of competitors) {
      for (const seat of competitor.seatNumbers) {
        const { category } = seatUnitPrice(competitor.showtime, seat);
        perCategory[category].push(
          competitor.seatPrices[seat] ?? competitor.resalePrice / competitor.seatNumbers.length,
        );
      }
    }
    const categoryMarket = Object.fromEntries(SEAT_CATEGORIES.map((category) => [category, 0])) as Record<
      SeatCategory,
      number
    >;
    for (const category of SEAT_CATEGORIES) {
      const prices = perCategory[category];
      // whole rupees, the way a seller would quote a seat
      categoryMarket[category] = prices.length
        ? Math.round(prices.reduce((total, price) => total + price, 0) / prices.length)
        : Math.round(categoryUnitPrice(showtime.basePrice, category) * 0.8);
    }

    return {
      categoryMarket,
      originalPrice: round2(bookingPrice),
      marketAverage,
      lowestPrice,
      highestPrice,
      minPrice: 50,
      maxPrice: bookingPrice,
      recommendedPrice,
      recommendedMin,
      recommendedMax,
      competitionCount,
      urgencyFactor,
      saleProbability,
      demandLabel: saleProbability >= 70 ? 'High' : saleProbability >= 45 ? 'Medium' : 'Low',
      insights,
    };
  }

  createTransaction(
    userId: number,
    resaleTicketId: number,
    seatNumbers?: string[],
    useWallet?: boolean,
  ): CreateTransactionResponse {
    this.closeUnsoldListings();
    const listing = this.resaleTickets.find((candidate) => candidate.id === resaleTicketId);
    if (!listing) {
      throw new MockApiError('Ticket not found.', 404);
    }
    if (listing.status === 'Expired') {
      throw new MockApiError('This show has already started.', 409);
    }
    if (listing.status !== 'Available') {
      throw new MockApiError('This ticket has already been sold.', 409);
    }
    if (listing.sellerId === userId) {
      throw new MockApiError("You can't buy your own listing.", 400);
    }

    const wanted = seatNumbers?.length ? [...new Set(seatNumbers)] : null;
    if (wanted && !wanted.every((seat) => listing.seatNumbers.includes(seat))) {
      throw new MockApiError('Pick seats from this listing.', 400);
    }
    // Taking only some of the seats splits the listing: the bought seats become their own sold
    // listing and the rest stay on the market at their share of the price.
    const ticket =
      wanted && wanted.length < listing.seatNumbers.length
        ? this.splitListing(listing, wanted)
        : listing;

    const transaction: ResaleTransaction = {
      id: this.nextTransactionId++,
      resaleTicketId: ticket.id,
      buyerId: userId,
      sellerId: ticket.sellerId,
      resalePrice: ticket.resalePrice,
      buyerFee: ticket.buyerFee,
      totalBuyerPays: round2(ticket.resalePrice + ticket.buyerFee),
      sellerReceives: ticket.sellerReceives,
      status: 'Completed',
      paymentId: `pi_mock_${Date.now()}`,
      purchasedAt: isoNow(),
      completedAt: isoNow(),
      role: 'buyer',
      ticket: this.toResaleDetail(ticket),
      counterpart: this.users.find((candidate) => candidate.id === ticket.sellerId) ?? null,
    };

    const walletUsed = useWallet
      ? this.applyWallet(
          userId,
          'debit',
          transaction.totalBuyerPays,
          `Resale purchase: ${transaction.ticket?.showtime.movie.title ?? 'ticket'}`,
          { kind: 'resale', id: ticket.id },
        )
      : 0;
    if (walletUsed > 0) {
      transaction.walletPaid = walletUsed;
    }

    ticket.status = 'Sold';
    ticket.buyerId = userId;
    ticket.soldAt = isoNow();
    this.resaleTransactions.unshift(transaction);

    // No escrow: the seller is paid at once.
    const movieTitle = transaction.ticket?.showtime.movie.title ?? 'ticket';
    const seller = this.users.find((candidate) => candidate.id === ticket.sellerId);
    if (seller) {
      this.applyWallet(seller.id, 'credit', transaction.sellerReceives, `Resale sale: ${movieTitle}`, {
        kind: 'resale',
        id: listing.id,
      });
      seller.totalEarned = round2(seller.totalEarned + transaction.sellerReceives);
    }

    // The buyer gets the seats as a normal booking.
    const sourceBooking = this.bookings.find((candidate) => candidate.id === ticket.bookingId);
    const booking: Booking = {
      id: this.nextBookingId++,
      showtimeId: sourceBooking!.showtimeId,
      userId,
      quantity: ticket.seatNumbers.length,
      seatNumbers: [...ticket.seatNumbers],
      bookingPrice: transaction.resalePrice,
      commissionFee: transaction.buyerFee,
      totalAmount: transaction.totalBuyerPays,
      paymentId: transaction.paymentId ?? `pi_mock_${Date.now()}`,
      status: 'Completed',
      qrCode: '',
      confirmationCode: randomConfirmationCode('SH'),
      bookedAt: isoNow(),
      cancelledAt: null,
      fromResale: true,
    };
    booking.qrCode = `THIRAIHUB:${booking.confirmationCode}`;
    if (walletUsed > 0) {
      booking.walletPaid = walletUsed;
    }
    this.bookings.unshift(booking);

    this.pushNotification({
      type: 'resale',
      title: 'Your ticket is confirmed',
      body: `${booking.quantity} ticket${booking.quantity > 1 ? 's' : ''} for ${movieTitle} are in My bookings.`,
      link: '/my-bookings',
    });

    return {
      transactionId: transaction.id,
      bookingId: booking.id,
      paymentUrl: `/checkout/resale/${transaction.id}`,
      resalePrice: transaction.resalePrice,
      buyerFee: transaction.buyerFee,
      totalBuyerPays: transaction.totalBuyerPays,
      walletUsed,
      amountDue: round2(transaction.totalBuyerPays - walletUsed),
    };
  }

  /** Moves `seats` out of `listing` into a new listing priced at their share, and reprices what is left. */
  private splitListing(listing: ResaleTicket, seats: string[]): ResaleTicket {
    if (!listing.allowPartial) {
      throw new MockApiError('The seller sells these seats together only.', 400);
    }

    const booking = this.bookings.find((candidate) => candidate.id === listing.bookingId)!;
    const info = this.seatInfoFor(booking);
    const pick = (ids: string[]): Record<string, number> =>
      Object.fromEntries(ids.map((seat) => [seat, listing.seatPrices[seat]]));
    const sum = (prices: Record<string, number>): number =>
      round2(Object.values(prices).reduce((total, price) => total + price, 0));

    const takenPrices = pick(seats);
    const price = sum(takenPrices);
    const original = round2(seats.reduce((total, seat) => total + info[seat].paid, 0));
    const listedSeatCount = listing.listedSeatCount ?? listing.seatNumbers.length;
    const splitGroup = listing.splitGroup ?? listing.id;
    const taken: ResaleTicket = {
      ...listing,
      id: this.nextResaleId++,
      splitGroup,
      listedSeatCount,
      seatNumbers: [...seats],
      seatPrices: takenPrices,
      allowPartial: false,
      originalPrice: original,
      resalePrice: price,
      sellerCommission: round2(price * (1 - SELLER_KEEPS)),
      buyerFee: resaleBuyerFee(seats.length),
      sellerReceives: round2(price * SELLER_KEEPS),
    };

    const rest = listing.seatNumbers.filter((seat) => !seats.includes(seat));
    const restPrices = pick(rest);
    const left = sum(restPrices);
    listing.splitGroup = splitGroup;
    listing.listedSeatCount = listedSeatCount;
    listing.seatNumbers = rest;
    listing.seatPrices = restPrices;
    listing.allowPartial = listing.allowPartial && rest.length > 1;
    // The cap for what is left is the paid total of its remaining seats.
    listing.originalPrice = round2(rest.reduce((total, seat) => total + info[seat].paid, 0));
    listing.resalePrice = left;
    listing.sellerCommission = round2(left * (1 - SELLER_KEEPS));
    listing.buyerFee = resaleBuyerFee(rest.length);
    listing.sellerReceives = round2(left * SELLER_KEEPS);

    this.resaleTickets.unshift(taken);
    return taken;
  }

  getTransactions(userId: number): TransactionListResponse {
    const transactions = this.resaleTransactions
      .filter(
        (transaction) => transaction.buyerId === userId || transaction.sellerId === userId,
      )
      .map((transaction) => ({
        ...transaction,
        role: transaction.buyerId === userId ? ('buyer' as const) : ('seller' as const),
        ticket: this.toResaleDetail(
          this.resaleTickets.find((ticket) => ticket.id === transaction.resaleTicketId)!,
        ),
        counterpart: this.users.find(
          (user) =>
            user.id === (transaction.buyerId === userId ? transaction.sellerId : transaction.buyerId),
        ) ?? null,
      }))
      .sort((a, b) => new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime());

    return { transactions: clone(transactions) };
  }

  // ----------------------------------------------------------- reviews

  addReview(userId: number, body: CreateReviewRequest): { reviewId: number; review: Review } {
    if (!body.rating || body.rating < 1 || body.rating > 5) {
      throw new MockApiError('Rating must be between 1 and 5.', 400);
    }
    if (body.comment && body.comment.length > 200) {
      throw new MockApiError('Review comments are limited to 200 characters.', 400);
    }
    if (body.revieweeId === userId) {
      throw new MockApiError('You cannot review yourself.', 400);
    }

    const review: Review = {
      id: this.nextReviewId++,
      reviewerId: userId,
      revieweeId: body.revieweeId,
      type: body.type,
      rating: body.rating,
      comment: body.comment?.trim() ? body.comment.trim() : null,
      createdAt: isoNow(),
      reviewerName: this.requireUser(userId).fullName,
    };
    this.reviews.unshift(review);
    this.applyRatingToUser(review);
    return { reviewId: review.id, review: clone(review) };
  }

  getReviews(userId: number): ReviewListResponse {
    const reviews = this.reviews
      .filter((review) => review.revieweeId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const totalReviews = reviews.length;
    const averageRating = totalReviews
      ? round2(reviews.reduce((total, review) => total + review.rating, 0) / totalReviews)
      : 0;

    const breakdown = [5, 4, 3, 2, 1].map((rating) => ({
      rating,
      count: reviews.filter((review) => review.rating === rating).length,
    }));

    return { reviews: clone(reviews), averageRating, totalReviews, breakdown };
  }

  // --------------------------------------------------------- internals

  /** Accepts `9876543210`, `+91 98765 43210` or any spacing and stores E.164. */
  /** A mobile number as +91 and ten digits, or an email in lower case; anything else is refused. */
  private cleanContact(kind: 'phone' | 'email', value: string): string {
    if (kind === 'phone') {
      const digits = value.replace(/\D/g, '').slice(-10);
      if (digits.length !== 10) {
        throw new MockApiError('Enter a 10-digit mobile number.', 400);
      }
      return `+91${digits}`;
    }
    const email = value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new MockApiError('Enter a valid email address.', 400);
    }
    return email;
  }

  private normalizePhone(phoneNumber: string): string {
    const digits = phoneNumber.replace(/\D/g, '');
    return `+91${digits.slice(-10)}`;
  }

  private createUser(phoneNumber: string): User {
    const user: User = {
      id: this.nextUserId++,
      phoneNumber,
      fullName: '',
      firstName: '',
      lastName: '',
      email: null,
      city: 'Chennai',
      bio: null,
      profileImageUrl: null,
      birthday: null,
      interests: [],
      userType: 'Both',
      isPhoneVerified: true,
      buyerRating: 0,
      buyerReviewCount: 0,
      sellerRating: 0,
      sellerReviewCount: 0,
      walletBalance: 0,
      totalEarned: 0,
      createdAt: isoNow(),
      isActive: true,
    };
    this.users.push(user);
    return user;
  }

  private requireUser(userId: number): User {
    const user = this.users.find((candidate) => candidate.id === userId);
    if (!user) {
      throw new MockApiError('User not found.', 404);
    }
    return user;
  }

  private createToken(userId: number): string {
    return btoa(`thiraihub:${userId}:${Date.now()}`);
  }

  userIdFromToken(token: string | null): number {
    if (!token) {
      return 0;
    }
    try {
      const payload = atob(token).split(':');
      return Number(payload[1]);
    } catch {
      return 0;
    }
  }

  private withRefs(showtime: Showtime): ShowtimeWithRefs | null {
    const movie = this.movies.find((candidate) => candidate.id === showtime.movieId);
    const theater = this.theaters.find((candidate) => candidate.id === showtime.theaterId);
    if (!movie || !theater) {
      return null;
    }
    return { ...showtime, movie, theater };
  }

  /**
   * Each seat's category and what the buyer paid for it. The booking total is split by list price,
   * so a booking that was paid for as a whole still gives every seat its own price.
   */
  private seatInfoFor(booking: Booking): Record<string, { category: SeatCategory; paid: number }> {
    const showtime = this.showtimes.find((candidate) => candidate.id === booking.showtimeId)!;
    const units = booking.seatNumbers.map((seat) => ({ seat, ...seatUnitPrice(showtime, seat) }));
    const listTotal = units.reduce((total, unit) => total + unit.price, 0);
    const info: Record<string, { category: SeatCategory; paid: number }> = {};
    for (const unit of units) {
      info[unit.seat] = {
        category: unit.category,
        paid: round2((booking.bookingPrice * unit.price) / listTotal),
      };
    }
    return info;
  }

  /** Spreads a new total over the seats in proportion to their current prices; the last seat takes any rounding. */
  private rescale(prices: Record<string, number>, seats: string[], total: number): Record<string, number> {
    const current = seats.reduce((sum, seat) => sum + prices[seat], 0);
    const out: Record<string, number> = {};
    let used = 0;
    seats.forEach((seat, index) => {
      const value = index === seats.length - 1 ? round2(total - used) : round2((total * prices[seat]) / current);
      out[seat] = value;
      used += value;
    });
    return out;
  }

  /** Seats of a booking that are neither on the market nor already sold on it. */
  private unlistedSeatsOf(booking: Booking): string[] {
    const taken = new Set(
      this.resaleTickets
        .filter(
          (ticket) =>
            ticket.bookingId === booking.id && (ticket.status === 'Available' || ticket.status === 'Sold'),
        )
        .flatMap((ticket) => ticket.seatNumbers),
    );
    return booking.seatNumbers.filter((seat) => !taken.has(seat));
  }

  private toBookingDetail(booking: Booking): BookingDetail {
    const showtime = this.showtimes.find((candidate) => candidate.id === booking.showtimeId)!;
    const resaleListing = this.resaleTickets.find(
      (ticket) => ticket.bookingId === booking.id && ticket.status === 'Available',
    );
    const info = this.seatInfoFor(booking);
    return {
      ...booking,
      showtime: this.withRefs(showtime)!,
      resaleListingId: resaleListing?.id ?? null,
      isListed: !!resaleListing,
      unlistedSeats: this.unlistedSeatsOf(booking),
      unlistedSeatDetails: this.unlistedSeatsOf(booking).map((id) => ({ id, ...info[id] })),
    };
  }

  private toResaleDetail(ticket: ResaleTicket): ResaleTicketDetail | null {
    const booking = this.bookings.find((candidate) => candidate.id === ticket.bookingId);
    const resolved = this.showtimes.find((candidate) => candidate.id === booking?.showtimeId);
    if (!resolved) {
      return null;
    }
    const seller = this.users.find((candidate) => candidate.id === ticket.sellerId);
    if (!seller) {
      return null;
    }
    const reviews = this.reviews.filter((review) => review.revieweeId === seller.id);

    return {
      ...ticket,
      showtime: this.withRefs(resolved)!,
      seller: clone(seller),
      reviews: clone(reviews.slice(0, 5)),
      discountPercent: ticket.originalPrice
        ? Math.round(((ticket.originalPrice - ticket.resalePrice) / ticket.originalPrice) * 100)
        : 0,
      daysUntilShow: Math.max(0, daysBetween(new Date(), resolved.showDateTime)),
    };
  }

  private applyRatingToUser(review: Review): void {
    const user = this.users.find((candidate) => candidate.id === review.revieweeId);
    if (!user) {
      return;
    }
    const all = this.reviews.filter((candidate) => candidate.revieweeId === user.id && candidate.type === review.type);
    const average = round2(all.reduce((total, item) => total + item.rating, 0) / all.length);
    if (review.type === 'BuyerReview') {
      user.buyerRating = average;
      user.buyerReviewCount = all.length;
    } else {
      user.sellerRating = average;
      user.sellerReviewCount = all.length;
    }
  }

  private pushNotification(input: Omit<AppNotification, 'id' | 'isRead' | 'createdAt'>): void {
    this.notifications.unshift({
      ...input,
      id: this.nextNotificationId++,
      isRead: false,
      createdAt: isoNow(),
    });
  }

  getNotifications(userId: number): NotificationListResponse {
    const notifications = [...this.notifications].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return {
      notifications: clone(notifications),
      unreadCount: notifications.filter((notification) => !notification.isRead).length,
    };
  }

  markNotificationRead(userId: number, notificationId: number): { success: boolean } {
    const notification = this.notifications.find((candidate) => candidate.id === notificationId);
    if (!notification) {
      throw new MockApiError('Notification not found.', 404);
    }
    notification.isRead = true;
    return { success: true };
  }

  markAllNotificationsRead(userId: number): { success: boolean } {
    this.notifications.forEach((notification) => (notification.isRead = true));
    return { success: true };
  }
}
