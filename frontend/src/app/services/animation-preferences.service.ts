import { isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, PLATFORM_ID, signal } from '@angular/core';

const MAGIC_WRITING_STORAGE_KEY = 'mystariapedia.magicWritingEnabled';

@Injectable({
  providedIn: 'root',
})
export class AnimationPreferencesService {
  readonly magicWritingEnabled = signal(true);

  constructor(@Inject(PLATFORM_ID) private readonly platformId: object) {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const storedValue = window.localStorage.getItem(MAGIC_WRITING_STORAGE_KEY);

    if (storedValue !== null) {
      this.magicWritingEnabled.set(storedValue === 'true');
    }
  }

  setMagicWritingEnabled(enabled: boolean): void {
    this.magicWritingEnabled.set(enabled);

    if (isPlatformBrowser(this.platformId)) {
      window.localStorage.setItem(MAGIC_WRITING_STORAGE_KEY, String(enabled));
    }
  }

  toggleMagicWriting(): void {
    this.setMagicWritingEnabled(!this.magicWritingEnabled());
  }
}
