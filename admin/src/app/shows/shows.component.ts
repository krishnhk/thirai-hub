import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { AdminStore } from '../core/admin-store';
import { categoriesUsed, isCategory } from '../core/layout';
import { CLEANING_MINUTES, FORMATS, INTERVAL_MINUTES, LANGUAGES, MIN_PRICE, Movie, Prices, Show, STARTING_SOON_MINUTES } from '../core/models';
import { ToastService } from '../core/toast.service';
import { DateFieldComponent } from '../shared/date-field.component';
import { TimeFieldComponent } from '../shared/time-field.component';
import { SelectFieldComponent, SelectOption } from '../shared/select-field.component';


/** yyyy-mm-dd in local time, so a show and a day on the strip compare by calendar day. */
function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

type Status = 'draft' | 'live' | 'soon' | 'started';
type StatusFilter = 'all' | 'draft' | 'live' | 'started';

/** What the admin is asked to confirm before a show goes on sale. */
interface ConfirmDetails {
  film: string;
  poster?: string;
  minutes: number;
  screen: string;
  when: string;
  ends: string;
  format: string;
  language: string;
  prices: { name: string; price: number }[];
}

interface StripDay {
  key: string;
  weekday: string;
  day: number;
  month: string;
  count: number;
}

@Component({
  selector: 'app-shows',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, DateFieldComponent, TimeFieldComponent, SelectFieldComponent],
  template: `
    <header class="page-header">
      <div>
        <h1>Shows</h1>
        <p class="lede">Schedule films on your screens and publish them for booking.</p>
      </div>
      <div class="header-actions">
        <button
          class="btn primary"
          type="button"
          [disabled]="store.screens().length === 0"
          [attr.aria-expanded]="formOpen()"
          aria-controls="show-form"
          (click)="openForm()"
        >New show</button>
      </div>
    </header>

    <div class="day-bar">
      <div class="day-tabs" role="tablist" aria-label="Choose a day" (wheel)="wheelScroll($event)">
        @for (d of days(); track d.key) {
          <button class="day-tab" type="button" role="tab" [attr.aria-selected]="d.key === selectedDay()" (click)="selectDay(d.key)">
            <span class="dow">{{ d.weekday }}</span>
            <span class="dom num">{{ d.day }} {{ d.month }}</span>
            <span class="count num" [attr.aria-label]="d.count + (d.count === 1 ? ' show' : ' shows')">{{ d.count }}</span>
          </button>
        } @empty {
          <span class="muted strip-empty">No shows scheduled from today.</span>
        }
      </div>
      <dl class="summary num" aria-label="Summary for {{ dayLabel() }}">
        <div><dt>Shows</dt><dd>{{ dayShows().length }}</dd></div>
        <div><dt><i class="k draft"></i>Drafts</dt><dd>{{ totals().drafts }}</dd></div>
        <div><dt><i class="k live"></i>On sale</dt><dd>{{ totals().onSale }}</dd></div>
        <div><dt><i class="k started"></i>Started</dt><dd>{{ totals().started }}</dd></div>
      </dl>
    </div>

    <section class="card">
      <div class="card-toolbar">
        <div class="segmented" role="group" aria-label="Filter shows">
          @for (f of filters; track f.key) {
            <button type="button" [attr.aria-pressed]="filter() === f.key" (click)="filter.set(f.key)">{{ f.label }}</button>
          }
        </div>
        <div class="tool-end">
        @if (openDrafts().length) {
          <label class="check">
            <input type="checkbox" [checked]="allDraftsSelected()" (change)="selectAll($any($event.target).checked)" />
            Select all drafts
          </label>
        }
          <div class="segmented" role="group" aria-label="View">
            <button type="button" [attr.aria-pressed]="view() === 'time'" (click)="view.set('time')">All shows</button>
            <button type="button" [attr.aria-pressed]="view() === 'screen'" (click)="view.set('screen')">By screen</button>
          </div>
        </div>
      </div>

      @if (visibleShows().length) {
        <div class="table-wrap">
          <table class="data-table" [class.by-screen]="view() === 'screen'">
            <caption class="sr-only">Shows on {{ dayLabel() }}</caption>
            <thead>
              <tr>
                <th class="c-check"><span class="sr-only">Select</span></th>
                <th scope="col" class="c-time">Time</th>
                <th scope="col" class="c-poster">Film</th>
                <th class="c-film"><span class="sr-only">Title</span></th>
                @if (view() === 'time') {
                  <th scope="col" class="c-where">Screen</th>
                }
                <th scope="col" class="c-prices">Prices</th>
                <th scope="col" class="c-status">Status</th>
              </tr>
            </thead>
            <tbody>
              @for (g of groups(); track g.id) {
                @if (g.name) {
                  <tr class="group-row">
                    <th colspan="6" scope="rowgroup">
                      <button class="group-head" type="button" [attr.aria-expanded]="isOpen(g.id)" (click)="toggleScreen(g.id)">
                        <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                        <span class="group-name">{{ g.name }}</span>
                        <span class="group-meta num">{{ g.type }} · {{ g.seats }} seats</span>
                        <span class="group-count num">{{ g.shows.length }} {{ g.shows.length === 1 ? 'show' : 'shows' }}</span>
                      </button>
                    </th>
                  </tr>
                }
                @if (!g.name || isOpen(g.id)) {
                @for (s of g.shows; track s.id) {
                <tr [class]="'st-' + statusClass(s)">
                  <td class="c-check">
                    @if (isOpenDraft(s)) {
                      <input
                        type="checkbox"
                        [checked]="!!selected()[s.id]"
                        (change)="togglePick(s.id, $any($event.target).checked)"
                        [attr.aria-label]="'Select ' + movieTitle(s.movieId) + ' at ' + timeText(s.start) + ' to publish'"
                      />
                    }
                  </td>
                  <td class="c-time num">
                    <strong>{{ timeText(s.start) }}</strong>
                    <small>to {{ timeText(endOf(s)) }}</small>
                  </td>
                  <td class="c-poster">
                    @if (movieOf(s.movieId)?.posterUrl; as poster) {
                      <img class="poster" [src]="poster" alt="" loading="lazy" />
                    } @else {
                      <span class="poster blank" aria-hidden="true">{{ movieTitle(s.movieId).charAt(0) }}</span>
                    }
                  </td>
                  <td class="c-film">
                    <strong>{{ movieTitle(s.movieId) }}</strong>
                    <small class="num">{{ movieOf(s.movieId)?.minutes }} min · {{ s.language }} <span class="fmt">{{ s.format }}</span></small>
                  </td>
                  @if (view() === 'time') {
                    <td class="c-where">
                      <strong>{{ screenName(s.screenId) }}</strong>
                      <small>{{ screenType(s.screenId) }}</small>
                    </td>
                  }
                  <td class="c-prices">
                    <dl class="prices">
                      @for (p of priceList(s.prices); track p.name) {
                        <div><dt>{{ p.name }}</dt><dd class="num">₹{{ p.price }}</dd></div>
                      }
                    </dl>
                  </td>
                  <td class="c-status"><span class="badge" [class]="statusClass(s)">{{ statusText(s) }}</span></td>
                </tr>
                } @empty {
                  <tr class="group-empty"><td colspan="6">No shows on this screen.</td></tr>
                }
                }
              }
            </tbody>
          </table>
        </div>
      } @else {
        <div class="empty">
          @if (dayShows().length) {
            <p>No shows match this filter on {{ dayLabel() }}.</p>
          } @else {
            <span class="empty-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false"><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
            </span>
            <p><strong>Nothing scheduled for {{ dayLabel() }} yet.</strong></p>
            <p class="muted small">Create a show, then publish it when it is ready for customers.</p>
            <button class="btn primary empty-action" type="button" [disabled]="store.screens().length === 0" (click)="openForm()">New show</button>
          }
        </div>
      }

      @if (openDrafts().length) {
        <footer class="card-footer">
          <span class="muted">
            {{ selectedCount() ? selectedCount() + (selectedCount() === 1 ? ' draft' : ' drafts') + ' selected' : 'Select drafts to publish them' }}
          </span>
          <button class="btn primary" type="button" [disabled]="selectedCount() === 0" (click)="publishSelected()">Publish selected</button>
        </footer>
      }
    </section>

    @if (formOpen()) {
      <div class="scrim" aria-hidden="true" (click)="closeForm()"></div>
      <aside id="show-form" class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" (keydown.escape)="closeForm()">
        <form class="drawer-form" [formGroup]="form" (submit)="$event.preventDefault()" novalidate>
          <header class="drawer-head">
            <div>
              <p class="label">New show · {{ dayLabel() }}</p>
              <h2 id="drawer-title">Schedule a show</h2>
            </div>
            <button class="icon-btn" type="button" (click)="closeForm()" aria-label="Close">×</button>
          </header>

          <div class="drawer-body">
            <section class="section">
              <h3>Film and screen</h3>
              <div class="stack">
                <div class="field combo">
                  <label for="f-movie">Film</label>
                  <div class="search-wrap">
                    <svg class="search-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
                    <input
                      id="f-movie"
                      class="input search-input"
                      type="text"
                      role="combobox"
                      autocomplete="off"
                      placeholder="Search films"
                      aria-autocomplete="list"
                      aria-controls="movie-list"
                      [attr.aria-expanded]="movieOpen()"
                      [attr.aria-activedescendant]="activeMovieId()"
                      [value]="movieQuery()"
                      (focus)="openMovies()"
                      (input)="typeMovie($event)"
                      (blur)="closeMovies()"
                      (keydown)="movieKey($event)"
                    />
                  </div>
                  @if (movieOpen()) {
                    <ul id="movie-list" class="options" role="listbox" aria-label="Films">
                      @for (m of filteredMovies(); track m.id; let i = $index) {
                        <li
                          role="option"
                          [id]="'movie-opt-' + m.id"
                          [attr.aria-selected]="i === movieActive()"
                          [class.on]="i === movieActive()"
                          (mousedown)="$event.preventDefault(); pickMovie(m.id)"
                        >
                          <span class="opt-film">
                            @if (m.posterUrl) {
                              <img class="opt-poster" [src]="m.posterUrl" alt="" />
                            }
                            {{ m.title }}
                          </span>
                          <span class="muted num">{{ m.minutes }} min</span>
                        </li>
                      } @empty {
                        <li class="none">No film matches “{{ movieQuery() }}”.</li>
                      }
                    </ul>
                  }
                </div>
                <div class="field">
                  <label for="f-screen">Screen</label>
                  <app-select inputId="f-screen" formControlName="screenId" [options]="screenOptions()" placeholder="Choose a screen" />
                </div>
              </div>
            </section>

            <section class="section">
              <h3>Schedule</h3>
              <div class="pair">
                <div class="field">
                  <label for="f-date">Date</label>
                  <app-date-field inputId="f-date" formControlName="date" [min]="today" />
                </div>
                <div class="field">
                  <label for="f-time">Start time</label>
                  <app-time-field inputId="f-time" formControlName="time" />
                </div>
              </div>
              <div class="pair">
                <div class="field">
                  <label for="f-format">Format</label>
                  <app-select inputId="f-format" formControlName="format" [options]="formatOptions" />
                </div>
                <div class="field">
                  <label for="f-lang">Language</label>
                  <app-select inputId="f-lang" formControlName="language" [options]="languageOptions" />
                </div>
              </div>
            </section>

            <section class="section" formGroupName="prices">
              <h3>Prices for this show</h3>
              @if (priceCategories().length) {
                <ul class="price-list">
                  @for (c of priceCategories(); track c) {
                    <li>
                      <label [for]="'fp-' + c">{{ c }}</label>
                      <span class="price-input">
                        <span aria-hidden="true">₹</span>
                        <input [id]="'fp-' + c" class="num" type="number" min="50" step="10" [formControlName]="c" />
                      </span>
                    </li>
                  }
                </ul>
              } @else {
                <p class="muted">This screen has no seats yet. Design its layout first.</p>
              }
            </section>
          </div>

          <div class="ends-bar">
            <span>Ends</span>
            <strong class="num">{{ previewEnd() }}</strong>
            <span class="muted">including {{ interval }} min break and {{ cleaning }} min cleaning</span>
          </div>

          <footer class="drawer-foot">
            @if (formError()) {
              <p class="error" role="alert">{{ formError() }}</p>
            }
            <div class="actions">
              <button class="btn" type="button" (click)="save(false)">Save as draft</button>
              <button class="btn primary" type="button" (click)="save(true)">Publish now</button>
            </div>
          </footer>
        </form>
      </aside>
    }

    @if (confirm(); as c) {
      <div class="scrim scrim-top" aria-hidden="true" (click)="cancelConfirm()"></div>
      <div
        class="confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-desc"
        (keydown.escape)="cancelConfirm()"
      >
        <div class="confirm-head">
          @if (c.poster) {
            <img class="confirm-poster" [src]="c.poster" alt="" />
          }
          <div>
            <p class="label">Confirm before publishing</p>
            <h2 id="confirm-title">Publish {{ c.film }}?</h2>
            <p id="confirm-desc" class="muted">Customers can book this show as soon as it is published.</p>
          </div>
        </div>

        <dl class="facts">
          <div><dt>Film</dt><dd>{{ c.film }} · {{ c.minutes }} min</dd></div>
          <div><dt>Screen</dt><dd>{{ c.screen }}</dd></div>
          <div><dt>Starts</dt><dd class="num">{{ c.when }}</dd></div>
          <div><dt>Ends</dt><dd class="num">{{ c.ends }} · includes {{ interval }} min break and {{ cleaning }} min cleaning</dd></div>
          <div><dt>Format</dt><dd>{{ c.format }} · {{ c.language }}</dd></div>
        </dl>

        <div class="confirm-prices" aria-label="Prices">
          @for (p of c.prices; track p.name) {
            <span class="tag price">{{ p.name }} ₹{{ p.price }}</span>
          }
        </div>

        <div class="confirm-actions">
          <button class="btn" type="button" (click)="cancelConfirm()">Back to edit</button>
          <button class="btn primary" type="button" (click)="save(true, true)">Publish show</button>
        </div>
      </div>
    }
  `,
  styles: `
    .day-bar { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px 24px; margin-bottom: 16px; border-bottom: 1px solid var(--border); }
    .day-tabs { display: flex; gap: 4px; min-width: 0; overflow-x: auto; scrollbar-width: none; }
    .day-tabs::-webkit-scrollbar { display: none; }
    .strip-empty { padding: 10px 0; }
    .day-tab { display: flex; align-items: center; gap: 6px; padding: 10px 12px; margin-bottom: -1px; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--text-muted); font-size: 0.88rem; white-space: nowrap; }
    .day-tab .dow { font-weight: 700; }
    .day-tab .count { min-width: 20px; padding: 0 6px; border-radius: 999px; background: var(--surface-3); font-size: 0.72rem; font-weight: 700; line-height: 18px; text-align: center; }
    .day-tab:hover { color: var(--text); }
    .day-tab[aria-selected="true"] { color: var(--text); border-bottom-color: var(--brand); }
    .day-tab[aria-selected="true"] .count { background: var(--brand); color: var(--on-primary); }
    .summary { display: flex; gap: 20px; margin: 0; padding-bottom: 10px; }
    .summary div { display: flex; align-items: baseline; gap: 6px; }
    .summary dt { font-size: 0.8rem; color: var(--text-muted); }
    .summary dd { margin: 0; font-size: 0.95rem; font-weight: 700; }
    .group-empty td { padding: 16px !important; color: var(--text-muted); font-size: 0.85rem; }
    .data-table td { white-space: nowrap; }
    .data-table th.c-time { width: 13%; } .data-table th.c-film { width: 32%; } .data-table th.c-where { width: 15%; } .data-table th.c-prices { width: 20%; }
    .data-table.by-screen th.c-film { width: 42%; } .data-table th.c-poster { width: 64px; }
    .c-time { white-space: nowrap; }
    .c-poster { padding-right: 0 !important; }
    .c-film strong, .c-film small { display: block; max-width: min(300px, 22vw); overflow: hidden; text-overflow: ellipsis; }
    .c-where strong { display: block; font-size: 0.9rem; font-weight: 600; }
    .c-where small { display: block; margin-top: 2px; font-size: 0.78rem; color: var(--text-muted); }
    .c-film .fmt { margin-left: 4px; padding: 0 6px; font-size: 0.68rem; vertical-align: 1px; }
    .prices { display: grid; grid-template-columns: max-content max-content; justify-content: start; gap: 2px 12px; margin: 0; }
    .prices div { display: contents; }
    .prices dt { font-size: 0.8rem; color: var(--text-muted); }
    .prices dd { margin: 0; font-size: 0.88rem; font-weight: 600; text-align: right; }
    .group-row th { padding: 0 !important; background: var(--surface) !important; border-bottom: 1px solid var(--border-soft); text-align: left; text-transform: none; letter-spacing: 0; font-weight: 400; }
    .group-row:not(:first-child) th { border-top: 1px solid var(--border); }
    .group-head { display: flex; align-items: center; gap: 10px; width: 100%; padding: 14px 16px; border: 0; background: none; text-align: left; }
    .group-head:hover { background: var(--surface-2); }
    .chevron { flex-shrink: 0; width: 16px; height: 16px; fill: none; stroke: var(--text-muted); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; transition: transform 150ms ease; }
    .group-head[aria-expanded="true"] .chevron { transform: rotate(90deg); }
    .group-name { font-size: 0.98rem; font-weight: 700; color: var(--text); }
    .group-meta { font-size: 0.8rem; color: var(--text-muted); }
    .group-count { margin-left: auto; font-size: 0.8rem; font-weight: 600; color: var(--text-soft); }
    .tool-end { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
    .data-table td { padding-top: 10px; padding-bottom: 10px; }
    .c-time strong, .c-film strong { display: block; font-size: 0.95rem; }
    .c-time small, .c-film small { display: block; margin-top: 2px; font-size: 0.78rem; color: var(--text-muted); }
    .poster { display: block; width: 44px; aspect-ratio: 2 / 3; border-radius: 6px; object-fit: cover; background: var(--surface-3); box-shadow: 0 1px 3px rgba(16, 24, 40, 0.18); }
    .poster.blank { display: grid; place-items: center; font-weight: 700; color: var(--text-soft); }
    .opt-film { display: inline-flex; align-items: center; gap: 10px; }
    .opt-poster { width: 26px; aspect-ratio: 2 / 3; border-radius: 4px; object-fit: cover; }
    .data-table td:first-child, .data-table th:first-child { padding-left: 16px; }
    .data-table td:last-child, .data-table th:last-child { padding-right: 16px; }
    .data-table .strong { font-weight: 700; font-size: 0.95rem; }
    .fmt { display: inline-block; padding: 1px 7px; border-radius: var(--radius-sm); background: var(--surface-2); border: 1px solid var(--border); font-size: 0.75rem; font-weight: 700; color: var(--text-soft); }
    .empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 48px 20px; text-align: center; color: var(--text-soft); }
    .empty-icon { display: grid; place-items: center; width: 52px; height: 52px; margin-bottom: 8px; border-radius: var(--radius-lg); background: var(--surface-2); border: 1px solid var(--border); }
    .empty-icon svg { width: 24px; height: 24px; fill: none; stroke: var(--text-soft); stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
    .empty-action { margin-top: 12px; }
    .small { font-size: 0.85rem; }
    .drawer {
      position: fixed; top: 0; right: 0; bottom: 0; z-index: 41;
      width: min(460px, 100%);
      display: flex; flex-direction: column;
      background: var(--surface); box-shadow: var(--shadow-lg);
      animation: slide-in 180ms ease-out;
    }
    .icon-btn { flex-shrink: 0; width: 34px; height: 34px; border-radius: var(--radius); border: 1px solid var(--border); background: var(--surface); font-size: 1.2rem; line-height: 1; color: var(--text-soft); }
    .icon-btn:hover { background: var(--surface-2); }
    .stack { display: flex; flex-direction: column; gap: 14px; }
    .pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .pair + .pair { margin-top: 14px; }
    .actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; }
    .combo, .search-wrap { position: relative; }
    .search-input { padding-left: 36px; }
    .search-icon { position: absolute; left: 11px; top: 50%; width: 16px; height: 16px; transform: translateY(-50%); fill: none; stroke: var(--text-muted); stroke-width: 1.8; stroke-linecap: round; pointer-events: none; }
    @keyframes slide-in { from { transform: translateX(16px); opacity: 0; } }
    /* Phones: each show is a card with its poster on the left */
    @media (max-width: 1100px) {
      .data-table, .data-table tbody { display: block; min-width: 0; }
      .data-table thead { display: none; }
      .data-table tr {
        display: grid; grid-template-columns: auto 68px minmax(0, 1fr) auto; column-gap: 0; row-gap: 4px;
        grid-template-areas: "check poster film status" "check poster time time" "check poster where where" "check poster prices prices";
        padding: 14px 16px; border-bottom: 1px solid var(--border-soft);
      }
      .data-table tbody tr:last-child { border-bottom: 0; }
      .data-table tr.group-row, .data-table tr.group-empty { display: block; padding: 0; }
      .group-row th { display: block; }
      .data-table td { display: block; padding: 0 !important; border: 0; width: auto; white-space: normal; }
      .data-table tr.group-empty td { padding: 14px 16px !important; }
      .data-table .c-check { grid-area: check; align-self: center; margin-right: 12px; }
      .data-table .c-check:empty { display: none; }
      .c-poster { grid-area: poster; }
      .poster { width: 56px; }
      .c-film { grid-area: film; }
      .c-status { grid-area: status; margin-left: 8px; }
      .c-time { grid-area: time; display: flex !important; gap: 6px; align-items: baseline; }
      .c-time strong { font-size: 0.88rem; }
      .c-time small { margin: 0; }
      .c-where { grid-area: where; font-size: 0.85rem; color: var(--text-soft); }
      .c-prices { grid-area: prices; margin-top: 2px; }
      .data-table tr[class^="st-"] { box-shadow: inset 3px 0 0 var(--st); }
      .data-table tr[class^="st-"] > td:first-child { box-shadow: none; }
    }
    @media (max-width: 760px) {
      .pair { grid-template-columns: minmax(0, 1fr); }
      .price-list .price-input { width: 130px; }
    }
  `,
})
export class ShowsComponent {
  readonly store = inject(AdminStore);
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly formats = FORMATS;
  readonly languages = LANGUAGES;
  readonly cleaning = CLEANING_MINUTES;
  readonly interval = INTERVAL_MINUTES;
  readonly formatOptions: SelectOption[] = FORMATS.map((f) => ({ value: f, label: f }));
  readonly languageOptions: SelectOption[] = LANGUAGES.map((l) => ({ value: l, label: l }));
  readonly screenOptions = computed<SelectOption[]>(() => this.store.screens().map((s) => ({ value: String(s.id), label: `${s.name} - ${s.type}` })));
  readonly today = dayKey(new Date());
  readonly filters: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'draft', label: 'Drafts' },
    { key: 'live', label: 'On sale' },
    { key: 'started', label: 'Started' },
  ];

  readonly now = signal(new Date());
  readonly selectedDay = signal(dayKey(new Date()));
  /** All of the theatre's shows in time order, or the same shows grouped by screen. */
  readonly view = signal<'time' | 'screen'>('time');

  /** The screens opened in the screen view; every screen starts closed. */
  readonly openScreens = signal<ReadonlySet<number>>(new Set());

  isOpen(screenId: number): boolean {
    return this.openScreens().has(screenId);
  }

  toggleScreen(screenId: number): void {
    this.openScreens.update((open) => {
      const next = new Set(open);
      if (next.has(screenId)) next.delete(screenId);
      else next.add(screenId);
      return next;
    });
  }

  /** The rows of the table: one group without a heading, or one group per screen in screen order. */
  readonly groups = computed(() => {
    const shows = this.visibleShows();
    if (this.view() === 'time') return [{ id: 0, name: '', type: '', seats: 0, shows }];
    return this.store.screens().map((screen) => ({
      id: screen.id,
      name: screen.name,
      type: screen.type,
      seats: screen.layout.cells.reduce((n, row) => n + row.filter((v) => isCategory(v)).length, 0),
      shows: shows.filter((x) => x.screenId === screen.id),
    }));
  });
  readonly filter = signal<StatusFilter>('all');
  readonly formOpen = signal(false);
  readonly formError = signal('');
  /** The show waiting for the admin's confirmation before it is published. */
  readonly confirm = signal<ConfirmDetails | null>(null);
  readonly selected = signal<Record<number, boolean>>({});

  private readonly screenKey = signal('');

  readonly form = this.fb.group({
    movieId: this.fb.nonNullable.control(''),
    screenId: this.fb.nonNullable.control(''),
    date: this.fb.nonNullable.control(this.today, Validators.required),
    time: this.fb.nonNullable.control('19:00', Validators.required),
    format: this.fb.nonNullable.control('2D', Validators.required),
    language: this.fb.nonNullable.control('Tamil', Validators.required),
    prices: this.fb.group<Record<string, FormControl<number>>>({}),
  });

  /** This theatre's shows, on any day. */
  readonly theatreShows = computed(() => this.store.shows().filter((s) => s.theatreId === this.store.theatreId()));

  readonly days = computed<StripDay[]>(() => {
    const counts = new Map<string, number>();
    for (const s of this.theatreShows()) {
      const key = dayKey(s.start);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    // Only days that have a show get a tab, from today onwards, in date order.
    const today = dayKey(new Date());
    const keys = [...counts.keys()].filter((key) => key >= today).sort();
    const out: StripDay[] = [];
    for (const key of keys) {
      const d = new Date(`${key}T00:00:00`);
      out.push({
        key,
        weekday: key === today ? 'Today' : d.toLocaleDateString('en-IN', { weekday: 'short' }),
        day: d.getDate(),
        month: d.toLocaleDateString('en-IN', { month: 'short' }),
        count: counts.get(key) ?? 0,
      });
    }
    return out;
  });

  readonly dayLabel = computed(() => {
    const day = new Date(`${this.selectedDay()}T00:00:00`);
    return day.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
  });

  readonly dayShows = computed(() =>
    this.theatreShows()
      .filter((s) => dayKey(s.start) === this.selectedDay())
      .sort((a, b) => a.start.getTime() - b.start.getTime()),
  );

  readonly visibleShows = computed(() => this.dayShows().filter((s) => this.matches(this.statusOf(s), this.filter())));

  readonly totals = computed(() => {
    let drafts = 0;
    let onSale = 0;
    let started = 0;
    for (const s of this.dayShows()) {
      const status = this.statusOf(s);
      if (status === 'draft') drafts++;
      if (status === 'live' || status === 'soon') onSale++;
      if (status === 'started') started++;
    }
    return { drafts, onSale, started };
  });

  readonly openDrafts = computed(() => this.dayShows().filter((s) => this.isOpenDraft(s)));
  readonly selectedCount = computed(() => this.openDrafts().filter((s) => this.selected()[s.id]).length);
  readonly allDraftsSelected = computed(() => this.openDrafts().length > 0 && this.selectedCount() === this.openDrafts().length);

  /** The film search: the text in the box, whether the list is open, and the highlighted row. */
  readonly movieQuery = signal('');
  readonly movieOpen = signal(false);
  readonly movieActive = signal(0);
  readonly filteredMovies = computed(() => {
    const query = this.movieQuery().trim().toLowerCase();
    const movies = this.store.movies();
    return query ? movies.filter((m) => m.title.toLowerCase().includes(query)) : movies;
  });
  readonly activeMovieId = computed(() => {
    const movie = this.filteredMovies()[this.movieActive()];
    return this.movieOpen() && movie ? `movie-opt-${movie.id}` : null;
  });

  readonly chosenScreen = computed(() => this.store.screens().find((s) => String(s.id) === this.screenKey()) ?? null);
  readonly priceCategories = computed(() => {
    const screen = this.chosenScreen();
    return screen ? categoriesUsed(screen.layout) : [];
  });

  constructor() {
    this.form.controls.screenId.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      this.screenKey.set(value);
      this.rebuildPrices();
    });
    // Keep the clock fresh so "started" and "starts soon" stay right while the page is open.
    const timer = setInterval(() => this.now.set(new Date()), 30000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  /** With no visible scrollbar, a mouse wheel over the day strip moves it sideways. */
  wheelScroll(event: WheelEvent): void {
    const strip = event.currentTarget as HTMLElement;
    if (strip.scrollWidth <= strip.clientWidth || Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
    event.preventDefault();
    strip.scrollLeft += event.deltaY;
  }

  selectDay(key: string): void {
    this.selectedDay.set(key);
    this.selected.set({});
  }

  openForm(): void {
    const firstMovie = this.store.movies()[0];
    const firstScreen = this.store.screens()[0];
    this.form.reset({
      movieId: firstMovie ? String(firstMovie.id) : '',
      screenId: firstScreen ? String(firstScreen.id) : '',
      date: this.selectedDay(),
      time: '19:00',
      format: '2D',
      language: 'Tamil',
    });
    this.rebuildPrices();
    this.formError.set('');
    this.movieOpen.set(false);
    this.movieQuery.set(this.selectedMovieTitle());
    this.formOpen.set(true);
  }

  closeForm(): void {
    this.formOpen.set(false);
    this.confirm.set(null);
  }

  cancelConfirm(): void {
    this.confirm.set(null);
  }

  openMovies(): void {
    this.movieOpen.set(true);
    this.movieActive.set(0);
  }

  typeMovie(event: Event): void {
    this.movieQuery.set((event.target as HTMLInputElement).value);
    this.movieOpen.set(true);
    this.movieActive.set(0);
  }

  /** Leaving the box without picking puts back the film that is already chosen. */
  closeMovies(): void {
    this.movieOpen.set(false);
    this.movieQuery.set(this.selectedMovieTitle());
  }

  pickMovie(id: number): void {
    this.form.controls.movieId.setValue(String(id));
    this.movieQuery.set(this.selectedMovieTitle());
    this.movieOpen.set(false);
  }

  movieKey(event: KeyboardEvent): void {
    const list = this.filteredMovies();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.movieOpen.set(true);
      this.movieActive.set(Math.min(this.movieActive() + 1, list.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.movieActive.set(Math.max(this.movieActive() - 1, 0));
    } else if (event.key === 'Enter' && this.movieOpen() && list[this.movieActive()]) {
      event.preventDefault();
      this.pickMovie(list[this.movieActive()].id);
    } else if (event.key === 'Escape' && this.movieOpen()) {
      // Close the list only; a second Escape closes the drawer.
      event.stopPropagation();
      this.closeMovies();
    }
  }

  private selectedMovieTitle(): string {
    const id = this.form.controls.movieId.value;
    return this.store.movies().find((m) => String(m.id) === id)?.title ?? '';
  }

  /** When the show will be over, cleaning included, for the summary in the drawer. */
  previewEnd(): string {
    const value = this.form.getRawValue();
    const movie = this.store.movies().find((m) => String(m.id) === value.movieId);
    const start = new Date(`${value.date}T${value.time}:00`);
    if (!movie || Number.isNaN(start.getTime())) return '—';
    return this.timeText(new Date(start.getTime() + (movie.minutes + INTERVAL_MINUTES + CLEANING_MINUTES) * 60000));
  }

  save(publish: boolean, confirmed = false): void {
    const value = this.form.getRawValue();
    const screen = this.chosenScreen();
    const movie = this.store.movies().find((m) => String(m.id) === value.movieId);
    const theatreId = this.store.theatreId();
    if (!screen || !movie || theatreId === null) {
      this.formError.set('Choose a film and a screen.');
      return;
    }
    const start = new Date(`${value.date}T${value.time}:00`);
    const prices = this.readPrices();
    const problem = this.findProblem(screen.id, start, movie.minutes, prices);
    if (problem) {
      this.formError.set(problem);
      return;
    }
    // Publishing asks first, with the details of the show; the form stays as it is until the admin confirms.
    if (publish && !confirmed) {
      this.confirm.set({
        film: movie.title,
        poster: movie.posterUrl,
        minutes: movie.minutes,
        screen: screen.name,
        when: `${start.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} | ${this.timeText(start)}`,
        ends: this.timeText(new Date(start.getTime() + (movie.minutes + INTERVAL_MINUTES + CLEANING_MINUTES) * 60000)),
        format: value.format,
        language: value.language,
        prices: this.priceList(prices),
      });
      return;
    }
    this.confirm.set(null);
    this.formError.set('');
    this.store.createShow(
      { theatreId, screenId: screen.id, movieId: movie.id, start, format: value.format, language: value.language, prices, published: publish },
      () => {
        this.formOpen.set(false);
        this.selectedDay.set(value.date);
        this.toast.show(`${movie.title} ${publish ? 'published' : 'saved as a draft'} for ${this.timeText(start)}.`);
      },
    );
  }

  togglePick(id: number, checked: boolean): void {
    this.selected.update((s) => ({ ...s, [id]: checked }));
  }

  selectAll(checked: boolean): void {
    const next = { ...this.selected() };
    for (const s of this.openDrafts()) next[s.id] = checked;
    this.selected.set(next);
  }

  publishSelected(): void {
    const ids = this.openDrafts().filter((s) => this.selected()[s.id]).map((s) => s.id);
    this.store.publishShows(ids, (published) => {
      const skipped = ids.length - published.length;
      this.selected.set({});
      this.toast.show(
        `${published.length} ${published.length === 1 ? 'show' : 'shows'} published.` +
          (skipped ? ` ${skipped} had already started and stayed as drafts.` : ''),
        published.length === 0,
      );
    });
  }

  isOpenDraft(s: Show): boolean {
    return !s.published && s.start > this.now();
  }

  statusOf(s: Show): Status {
    if (!s.published) return 'draft';
    if (s.start <= this.now()) return 'started';
    const minutes = (s.start.getTime() - this.now().getTime()) / 60000;
    return minutes < STARTING_SOON_MINUTES ? 'soon' : 'live';
  }

  statusText(s: Show): string {
    const labels: Record<Status, string> = { draft: 'Draft', live: 'On sale', soon: 'Starts soon', started: 'Started' };
    return labels[this.statusOf(s)];
  }

  statusClass(s: Show): string {
    return this.statusOf(s);
  }

  movieOf(id: number): Movie | undefined {
    return this.store.movies().find((m) => m.id === id);
  }

  movieTitle(id: number): string {
    return this.store.movies().find((m) => m.id === id)?.title ?? 'Film';
  }

  screenType(id: number): string {
    return this.store.screens().find((s) => s.id === id)?.type ?? '';
  }

  screenName(id: number): string {
    return this.store.screens().find((s) => s.id === id)?.name ?? 'Screen';
  }

  endOf(s: Show): Date {
    const minutes = this.store.movies().find((m) => m.id === s.movieId)?.minutes ?? 0;
    return new Date(s.start.getTime() + (minutes + INTERVAL_MINUTES + CLEANING_MINUTES) * 60000);
  }

  timeText(d: Date): string {
    return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  }

  priceList(prices: Prices): { name: string; price: number }[] {
    return Object.entries(prices).map(([name, price]) => ({ name, price: price ?? 0 }));
  }

  private matches(status: Status, filter: StatusFilter): boolean {
    if (filter === 'all') return true;
    if (filter === 'draft') return status === 'draft';
    if (filter === 'started') return status === 'started';
    return status === 'live' || status === 'soon';
  }

  private rebuildPrices(): void {
    const screen = this.chosenScreen();
    const controls: Record<string, FormControl<number>> = {};
    if (screen) {
      for (const category of categoriesUsed(screen.layout)) {
        controls[category] = this.fb.nonNullable.control(screen.layout.prices[category] ?? 0, [
          Validators.required,
          Validators.min(MIN_PRICE),
        ]);
      }
    }
    this.form.setControl('prices', this.fb.group(controls));
  }

  private readPrices(): Prices {
    const group = this.form.controls.prices as FormGroup<Record<string, FormControl<number>>>;
    return { ...group.getRawValue() } as Prices;
  }

  /** The first reason this show cannot be saved, or null when it can. */
  private findProblem(screenId: number, start: Date, minutes: number, prices: Prices): string | null {
    if (Number.isNaN(start.getTime())) return 'Choose a date and a start time.';
    if (start <= new Date()) return 'A show cannot start in the past.';
    if (Object.keys(prices).length === 0) return 'This screen has no seats yet. Design its layout first.';
    if (Object.values(prices).some((p) => !((p ?? 0) >= MIN_PRICE))) return `Every category price must be at least ₹${MIN_PRICE}.`;
    const end = new Date(start.getTime() + (minutes + INTERVAL_MINUTES + CLEANING_MINUTES) * 60000);
    for (const other of this.store.shows()) {
      if (other.screenId !== screenId) continue;
      const otherMinutes = this.store.movies().find((m) => m.id === other.movieId)?.minutes ?? 0;
      const otherEnd = new Date(other.start.getTime() + (otherMinutes + CLEANING_MINUTES) * 60000);
      if (start < otherEnd && end > other.start) {
        return `That screen is busy: ${this.movieTitle(other.movieId)} runs ${this.timeText(other.start)} to ${this.timeText(otherEnd)}. Pick another time or screen.`;
      }
    }
    return null;
  }
}
