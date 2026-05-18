import {
  AfterViewInit,
  Directive,
  ElementRef,
  effect,
  EffectRef,
  Inject,
  Injector,
  OnDestroy,
  PLATFORM_ID,
  Renderer2,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AnimationPreferencesService } from '../services/animation-preferences.service';

@Directive({
  selector: 'p',
  standalone: true,
})
export class MagicWritingDirective implements AfterViewInit, OnDestroy {
  private static revealQueue = Promise.resolve();

  private observer?: IntersectionObserver;
  private removeListeners: Array<() => void> = [];
  private revealed = false;
  private queued = false;
  private ticking = false;
  private destroyed = false;
  private revealTimeoutId?: number;
  private queuePauseTimeoutId?: number;
  private resolveQueueItem?: () => void;
  private preferenceEffect?: EffectRef;

  constructor(
    private readonly elementRef: ElementRef<HTMLElement>,
    private readonly renderer: Renderer2,
    private readonly animationPreferences: AnimationPreferencesService,
    private readonly injector: Injector,
    @Inject(PLATFORM_ID) private readonly platformId: object,
  ) {}

  ngAfterViewInit(): void {
    const element = this.elementRef.nativeElement;

    if (
      !isPlatformBrowser(this.platformId) ||
      this.prefersReducedMotion() ||
      !this.animationPreferences.magicWritingEnabled()
    ) {
      this.renderer.addClass(element, 'magic-writing-ready');
      return;
    }

    this.renderer.addClass(element, 'magic-writing');
    this.preferenceEffect = effect(
      () => {
        if (!this.animationPreferences.magicWritingEnabled()) {
          this.showWithoutAnimation(element);
        }
      },
      { injector: this.injector },
    );

    requestAnimationFrame(() => {
      if (this.destroyed || !this.animationPreferences.magicWritingEnabled()) {
        this.showWithoutAnimation(element);
        return;
      }

      if (this.isElementInView(element)) {
        this.queueReveal(element);
        return;
      }

      this.observeElement(element);
      this.listenToScroll(element);
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.preferenceEffect?.destroy();
    this.observer?.disconnect();
    this.cleanupListeners();

    if (this.revealTimeoutId) {
      window.clearTimeout(this.revealTimeoutId);
    }

    if (this.queuePauseTimeoutId) {
      window.clearTimeout(this.queuePauseTimeoutId);
    }

    this.finishQueueItem();
  }

  private prefersReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private observeElement(element: HTMLElement): void {
    if (!('IntersectionObserver' in window)) {
      this.reveal(element);
      return;
    }

    this.observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          this.queueReveal(element);
        }
      },
      { threshold: 0.01, rootMargin: '0px 0px -4% 0px' },
    );

    this.observer.observe(element);
  }

  private listenToScroll(element: HTMLElement): void {
    const scrollParent = this.findScrollParent(element);
    const checkVisibility = () => {
      if (this.ticking || this.revealed) {
        return;
      }

      this.ticking = true;
      requestAnimationFrame(() => {
        this.ticking = false;

        if (this.isElementInView(element)) {
          this.queueReveal(element);
        }
      });
    };

    this.removeListeners.push(this.renderer.listen('window', 'resize', checkVisibility));
    this.removeListeners.push(this.renderer.listen('window', 'scroll', checkVisibility));

    if (scrollParent) {
      this.removeListeners.push(this.renderer.listen(scrollParent, 'scroll', checkVisibility));
    }
  }

  private reveal(element: HTMLElement): void {
    if (this.revealed || this.destroyed) {
      return;
    }

    this.revealed = true;
    this.renderer.addClass(element, 'magic-writing-visible');
    this.observer?.disconnect();
    this.cleanupListeners();
  }

  private queueReveal(element: HTMLElement): void {
    if (this.queued || this.revealed || !this.animationPreferences.magicWritingEnabled()) {
      if (!this.animationPreferences.magicWritingEnabled()) {
        this.showWithoutAnimation(element);
      }

      return;
    }

    this.queued = true;
    this.observer?.disconnect();

    MagicWritingDirective.revealQueue = MagicWritingDirective.revealQueue.then(
      () =>
        new Promise<void>((resolve) => {
          this.resolveQueueItem = resolve;

          if (this.destroyed || this.revealed || !this.animationPreferences.magicWritingEnabled()) {
            this.finishQueueItem();
            return;
          }

          this.revealTimeoutId = window.setTimeout(() => {
            this.revealTimeoutId = undefined;

            if (this.destroyed || this.revealed || !this.animationPreferences.magicWritingEnabled()) {
              this.showWithoutAnimation(element);
              this.finishQueueItem();
              return;
            }

            this.reveal(element);
            this.queuePauseTimeoutId = window.setTimeout(() => {
              this.queuePauseTimeoutId = undefined;
              this.finishQueueItem();
            }, 820);
          }, 180);
        }),
    );
  }

  private showWithoutAnimation(element: HTMLElement): void {
    if (this.destroyed) {
      return;
    }

    this.revealed = true;
    this.observer?.disconnect();
    this.cleanupListeners();
    this.renderer.addClass(element, 'magic-writing-ready');

    if (this.revealTimeoutId) {
      window.clearTimeout(this.revealTimeoutId);
      this.revealTimeoutId = undefined;
    }

    if (this.queuePauseTimeoutId) {
      window.clearTimeout(this.queuePauseTimeoutId);
      this.queuePauseTimeoutId = undefined;
    }

    this.finishQueueItem();
  }

  private cleanupListeners(): void {
    this.removeListeners.forEach((removeListener) => removeListener());
    this.removeListeners = [];
  }

  private finishQueueItem(): void {
    this.resolveQueueItem?.();
    this.resolveQueueItem = undefined;
  }

  private isElementInView(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

    return rect.top < viewportHeight * 0.92 && rect.bottom > 0;
  }

  private findScrollParent(element: HTMLElement): HTMLElement | null {
    let parent = element.parentElement;

    while (parent) {
      const overflowY = window.getComputedStyle(parent).overflowY;

      if (overflowY === 'auto' || overflowY === 'scroll') {
        return parent;
      }

      parent = parent.parentElement;
    }

    return null;
  }
}
