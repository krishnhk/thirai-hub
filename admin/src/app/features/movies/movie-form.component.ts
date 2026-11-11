import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, output, signal } from '@angular/core';

import { AdminStore } from '../../core/admin-store';
import { fromDateInput, toDateInput } from '../../core/format';
import { Certification, CERTIFICATIONS, Movie, PROJECTION_FORMATS, ProjectionFormat } from '../../core/models';
import { ToastService } from '../../shared/feedback';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';
import { GENRES, LANGUAGES, POSTER_FILES, upcomingShowsByMovie } from './movie-data';

interface MovieDraft {
  title: string;
  posterUrl: string;
  languages: string[];
  runtime: string;
  genres: string[];
  certification: Certification;
  releaseDate: string;
  formats: ProjectionFormat[];
  director: string;
  cast: string;
  synopsis: string;
}

type Field = 'title' | 'languages' | 'runtime' | 'genres' | 'releaseDate' | 'formats' | 'director' | 'synopsis';

/** Add a film to the catalogue or edit one. Calls the store and closes on save. */
@Component({
  selector: 'app-movie-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, IconComponent],
  template: `
    <app-modal [title]="movie() ? 'Edit ' + movie()!.title : 'Add film'" [eyebrow]="movie() ? 'Film catalogue' : 'New film'" size="lg" (closed)="closed.emit()">
      <form id="movie-form" class="layout" novalidate (submit)="$event.preventDefault(); save()">
        <div class="poster-col">
          <div class="poster">@if (v().posterUrl) { <img [src]="v().posterUrl" alt="" /> } @else { <span>{{ v().title || 'No poster' }}</span> }</div>
          <div class="field">
            <label for="mf-poster">Poster</label>
            <select id="mf-poster" class="select" [value]="v().posterUrl" (change)="patch({ posterUrl: $any($event.target).value })">
              <option value="" [selected]="!v().posterUrl">No poster</option>
              @for (p of posters; track p) { <option [value]="'/posters/' + p + '.jpg'" [selected]="v().posterUrl === '/posters/' + p + '.jpg'">{{ p }}.jpg</option> }
            </select>
            <span class="hint">Choose an uploaded poster file or leave it empty.</span>
          </div>
        </div>

        <div class="form-grid">
          <div class="field full">
            <label for="mf-title">Title</label>
            <input id="mf-title" class="input" [class.invalid]="show('title')" [value]="v().title" (input)="text('title', $event)" placeholder="Film title as distributed" />
            @if (show('title')) { <span class="error-text">{{ errors()['title'] }}</span> }
          </div>
          <div class="field">
            <label for="mf-runtime">Runtime (minutes)</label>
            <input id="mf-runtime" class="input" type="number" min="30" max="300" [class.invalid]="show('runtime')" [value]="v().runtime" (input)="text('runtime', $event)" />
            @if (show('runtime')) { <span class="error-text">{{ errors()['runtime'] }}</span> } @else { <span class="hint">Without the interval. Used to check show overlaps.</span> }
          </div>
          <div class="field two">
            <div class="field">
              <label for="mf-cert">Certification</label>
              <select id="mf-cert" class="select" [value]="v().certification" (change)="patch({ certification: $any($event.target).value })">
                @for (c of certs; track c) { <option [value]="c" [selected]="v().certification === c">{{ c }}</option> }
              </select>
            </div>
            <div class="field">
              <label for="mf-release">Release date</label>
              <input id="mf-release" class="input" type="date" [class.invalid]="show('releaseDate')" [value]="v().releaseDate" (input)="text('releaseDate', $event)" />
              @if (show('releaseDate')) { <span class="error-text">{{ errors()['releaseDate'] }}</span> }
            </div>
          </div>

          <fieldset class="field full">
            <legend class="field-label">Languages</legend>
            <div class="chips">
              @for (l of languages; track l) {
                <label class="chip" [class.on]="v().languages.includes(l)"><input type="checkbox" [checked]="v().languages.includes(l)" (change)="toggle('languages', l)" />{{ l }}</label>
              }
            </div>
            @if (show('languages')) { <span class="error-text">{{ errors()['languages'] }}</span> }
          </fieldset>
          <fieldset class="field full">
            <legend class="field-label">Genres</legend>
            <div class="chips">
              @for (g of genres; track g) {
                <label class="chip" [class.on]="v().genres.includes(g)"><input type="checkbox" [checked]="v().genres.includes(g)" (change)="toggle('genres', g)" />{{ g }}</label>
              }
            </div>
            @if (show('genres')) { <span class="error-text">{{ errors()['genres'] }}</span> }
          </fieldset>
          <fieldset class="field full">
            <legend class="field-label">Supported formats</legend>
            <div class="chips">
              @for (f of formats; track f) {
                <label class="chip" [class.on]="v().formats.includes(f)"><input type="checkbox" [checked]="v().formats.includes(f)" (change)="toggle('formats', f)" />{{ f }}</label>
              }
            </div>
            @if (show('formats')) { <span class="error-text">{{ errors()['formats'] }}</span> } @else { <span class="hint">Shows can only be scheduled in these formats.</span> }
          </fieldset>

          <div class="field">
            <label for="mf-director">Director</label>
            <input id="mf-director" class="input" [class.invalid]="show('director')" [value]="v().director" (input)="text('director', $event)" />
            @if (show('director')) { <span class="error-text">{{ errors()['director'] }}</span> }
          </div>
          <div class="field">
            <label for="mf-cast">Cast</label>
            <input id="mf-cast" class="input" [value]="v().cast" (input)="text('cast', $event)" placeholder="Separate names with commas" />
          </div>
          <div class="field full">
            <label for="mf-synopsis">Synopsis</label>
            <textarea id="mf-synopsis" class="textarea" maxlength="600" [class.invalid]="show('synopsis')" [value]="v().synopsis" (input)="text('synopsis', $event)"></textarea>
            @if (show('synopsis')) { <span class="error-text">{{ errors()['synopsis'] }}</span> } @else { <span class="hint">{{ v().synopsis.length }} / 600</span> }
          </div>

          @if (conflicts().length) {
            <div class="callout warning full"><app-icon name="alert" /><span><strong>Upcoming shows use what you removed.</strong> {{ conflicts().join(' ') }} Those shows keep running as scheduled but cannot be edited or published until changed.</span></div>
          }
          @if (submitted() && !valid()) { <div class="callout danger full"><app-icon name="alert" /><span>Fix the highlighted fields to save the film.</span></div> }
        </div>
      </form>
      <ng-container footer>
        <button type="button" class="btn" (click)="closed.emit()">Cancel</button>
        <button type="submit" form="movie-form" class="btn primary">{{ movie() ? 'Save changes' : 'Add film' }}</button>
      </ng-container>
    </app-modal>
  `,
  styles: `
    .layout { display: grid; grid-template-columns: 170px minmax(0, 1fr); gap: 20px; align-items: start; }
    @media (max-width: 700px) { .layout { grid-template-columns: minmax(0, 1fr); } }
    .poster-col { display: flex; flex-direction: column; gap: 12px; }
    .poster { display: grid; place-items: center; aspect-ratio: 2 / 3; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface-3); overflow: hidden; padding: 10px; text-align: center; color: var(--text-muted); font-weight: 700; font-size: 0.85rem; }
    .poster:has(img) { padding: 0; }
    .poster img { width: 100%; height: 100%; object-fit: cover; }
    .field.two { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); gap: 12px; }
    fieldset { margin: 0; padding: 0; border: 0; min-width: 0; }
    legend { padding: 0; margin-bottom: 6px; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface-2); color: var(--text-soft); font-size: 0.8rem; cursor: pointer; }
    .chip:hover { border-color: var(--border-strong); }
    .chip.on { border-color: var(--accent-line); color: var(--text); }
    .chip input { width: 14px; height: 14px; margin: 0; }
    .chip:focus-within { outline: 2px solid var(--accent); outline-offset: 1px; }
    .callout.full { grid-column: 1 / -1; }
  `,
})
export class MovieFormComponent implements OnInit {
  private readonly store = inject(AdminStore);
  private readonly toast = inject(ToastService);

  readonly movie = input<Movie | null>(null);
  readonly closed = output<void>();
  readonly saved = output<string>();

  readonly posters = POSTER_FILES;
  readonly languages = LANGUAGES;
  readonly genres = GENRES;
  readonly formats = PROJECTION_FORMATS;
  readonly certs = CERTIFICATIONS;

  readonly v = signal<MovieDraft>({
    title: '', posterUrl: '', languages: ['Tamil'], runtime: '150', genres: [], certification: 'UA 13+',
    releaseDate: toDateInput(new Date()), formats: ['2D'], director: '', cast: '', synopsis: '',
  });
  readonly submitted = signal(false);
  private readonly touched = signal<ReadonlySet<string>>(new Set());

  ngOnInit(): void {
    const m = this.movie();
    if (m) {
      this.v.set({
        title: m.title, posterUrl: m.posterUrl ?? '', languages: [...m.languages], runtime: String(m.runtime), genres: [...m.genres],
        certification: m.certification, releaseDate: toDateInput(m.releaseDate), formats: [...m.formats], director: m.director,
        cast: m.cast.join(', '), synopsis: m.synopsis,
      });
    }
  }

  readonly errors = computed<Partial<Record<Field, string>>>(() => {
    const v = this.v();
    const e: Partial<Record<Field, string>> = {};
    const title = v.title.trim().toLowerCase();
    if (!title) e.title = 'Enter the film title.';
    else if (this.store.movies().some((m) => m.id !== this.movie()?.id && m.title.trim().toLowerCase() === title)) e.title = 'This film is already in the catalogue.';
    const rt = Number(v.runtime);
    if (!Number.isInteger(rt) || rt < 30 || rt > 300) e.runtime = 'Enter a runtime between 30 and 300 minutes.';
    if (!v.releaseDate) e.releaseDate = 'Choose the release date.';
    if (!v.languages.length) e.languages = 'Choose at least one language.';
    if (!v.genres.length) e.genres = 'Choose at least one genre.';
    if (!v.formats.length) e.formats = 'Choose at least one format.';
    if (!v.director.trim()) e.director = 'Enter the director.';
    if (!v.synopsis.trim()) e.synopsis = 'Add a one or two line synopsis for staff.';
    return e;
  });
  readonly valid = computed(() => Object.keys(this.errors()).length === 0);

  /** Formats or languages removed while upcoming shows still use them. */
  readonly conflicts = computed(() => {
    const m = this.movie();
    if (!m) return [];
    const shows = upcomingShowsByMovie(this.store).get(m.id) ?? [];
    const v = this.v();
    const out: string[] = [];
    const fmts = [...new Set(shows.map((s) => s.format))].filter((f) => !v.formats.includes(f));
    const langs = [...new Set(shows.map((s) => s.language))].filter((l) => !v.languages.includes(l));
    for (const f of fmts) out.push(`${shows.filter((s) => s.format === f).length} shows are in ${f}.`);
    for (const l of langs) out.push(`${shows.filter((s) => s.language === l).length} shows are in ${l}.`);
    return out;
  });

  show(f: Field): boolean { return !!this.errors()[f] && (this.submitted() || this.touched().has(f)); }

  text(f: keyof MovieDraft, ev: Event): void {
    const value = (ev.target as HTMLInputElement).value;
    this.v.update((x) => ({ ...x, [f]: value }));
    this.touched.update((s) => new Set(s).add(f));
  }
  patch(p: Partial<MovieDraft>): void { this.v.update((x) => ({ ...x, ...p })); }
  toggle(key: 'languages' | 'genres' | 'formats', value: string): void {
    this.v.update((x) => {
      const list = x[key] as string[];
      const next = list.includes(value) ? list.filter((y) => y !== value) : [...list, value];
      return { ...x, [key]: next };
    });
    this.touched.update((s) => new Set(s).add(key));
  }

  save(): void {
    this.submitted.set(true);
    if (!this.valid()) return;
    const v = this.v();
    const data: Omit<Movie, 'id'> = {
      title: v.title.trim(), posterUrl: v.posterUrl || undefined, languages: LANGUAGES.filter((l) => v.languages.includes(l)),
      runtime: Number(v.runtime), genres: v.genres, certification: v.certification, releaseDate: fromDateInput(v.releaseDate),
      formats: PROJECTION_FORMATS.filter((f) => v.formats.includes(f)), director: v.director.trim(),
      cast: v.cast.split(',').map((c) => c.trim()).filter(Boolean), synopsis: v.synopsis.trim(),
    };
    const own = this.movie();
    if (own) {
      this.store.updateMovie(own.id, data);
      this.toast.success('Film updated', `${data.title} details are saved.`);
      this.saved.emit(own.id);
    } else {
      const m = this.store.addMovie(data);
      this.toast.success('Film added', `${m.title} is in the catalogue and can be scheduled.`);
      this.saved.emit(m.id);
    }
    this.closed.emit();
  }
}
