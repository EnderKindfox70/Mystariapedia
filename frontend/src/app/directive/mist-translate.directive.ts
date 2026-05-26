import {
  AfterViewInit,
  Directive,
  ElementRef,
  HostListener,
  Input,
  OnDestroy,
  Renderer2,
} from '@angular/core';

@Directive({
  selector: '[mistTranslate], .mist-translate',
  standalone: true,
})
export class MistTranslateDirective implements AfterViewInit, OnDestroy {
  private static readonly defaultActiveDuration = 5.6;

  private translatedText = '';
  private activeDuration = MistTranslateDirective.defaultActiveDuration;
  private color = '';
  private baseColor = '';
  private translationColor = '';
  private viewReady = false;
  private sourceSpan?: HTMLSpanElement;
  private translationSpan?: HTMLSpanElement;
  private activeTimeoutId?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly elementRef: ElementRef<HTMLElement>,
    private readonly renderer: Renderer2,
  ) {}

  @Input('mistTranslate')
  set mistTranslate(value: string | null | undefined) {
    this.translatedText = value?.trim() ?? '';
    this.syncHost();
  }

  @Input('mistTranslation')
  set mistTranslation(value: string | null | undefined) {
    this.translatedText = value?.trim() ?? '';
    this.syncHost();
  }

  @Input()
  set mistColor(value: string | null | undefined) {
    this.color = value?.trim() ?? '';
    this.syncHost();
  }

  @Input()
  set mistBaseColor(value: string | null | undefined) {
    this.baseColor = value?.trim() ?? '';
    this.syncHost();
  }

  @Input()
  set mistTranslationColor(value: string | null | undefined) {
    this.translationColor = value?.trim() ?? '';
    this.syncHost();
  }

  @Input()
  set mistDuration(value: number | string | null | undefined) {
    const duration = Number(value);
    this.activeDuration = Number.isFinite(duration) && duration > 0
      ? duration
      : MistTranslateDirective.defaultActiveDuration;
  }

  ngAfterViewInit(): void {
    this.viewReady = true;

    if (!this.translatedText) {
      this.translatedText =
        this.readDataAttribute(this.elementRef.nativeElement, 'mistTranslation') ||
        this.readDataAttribute(this.elementRef.nativeElement, 'translation') ||
        '';
    }

    this.syncHost();
  }

  ngOnDestroy(): void {
    if (this.activeTimeoutId) {
      clearTimeout(this.activeTimeoutId);
    }

    this.renderer.removeClass(this.elementRef.nativeElement, 'mist-translate--active');
  }

  @HostListener('pointerenter')
  @HostListener('mouseover')
  @HostListener('mouseenter')
  @HostListener('focusin')
  @HostListener('click')
  activate(): void {
    const element = this.elementRef.nativeElement;

    this.renderer.addClass(element, 'mist-translate--active');

    if (this.activeTimeoutId) {
      clearTimeout(this.activeTimeoutId);
    }

    this.activeTimeoutId = setTimeout(() => {
      this.activeTimeoutId = undefined;
      this.renderer.removeClass(element, 'mist-translate--active');
    }, this.activeDuration * 1000);
  }

  private syncHost(): void {
    if (!this.viewReady || !this.translatedText) {
      return;
    }

    const element = this.elementRef.nativeElement;
    const originalText = this.sourceSpan?.textContent?.trim() || element.textContent?.trim() || '';

    this.renderer.addClass(element, 'mist-translate');
    this.renderer.setAttribute(element, 'data-mist-translation', this.translatedText);
    this.renderer.setAttribute(element, 'title', this.translatedText);
    this.renderer.setStyle(element, '--mist-source-size', `${Math.max(originalText.length, 1)}ch`);
    this.renderer.setStyle(element, '--mist-translation-size', `${Math.max(this.translatedText.length, 1)}ch`);

    const baseColor = this.resolveColor(
      this.baseColor ||
      this.color ||
      this.readDataAttribute(element, 'mistBaseColor') ||
      this.readDataAttribute(element, 'mistColor') ||
      this.readDataAttribute(element, 'color') ||
      '',
    );
    const translationColor = this.resolveColor(
      this.translationColor ||
      this.readDataAttribute(element, 'mistTranslationColor') ||
      baseColor,
    );

    if (baseColor) {
      this.renderer.setStyle(element, '--mist-base-color', baseColor);
      this.renderer.setStyle(element, '--mist-glow', baseColor);
    }

    if (translationColor) {
      this.renderer.setStyle(element, '--mist-translation-color', translationColor);
    }

    if (originalText) {
      this.renderer.setAttribute(
        element,
        'aria-label',
        `${originalText}, traduction : ${this.translatedText}`,
      );
    }

    if (!this.isNaturallyFocusable(element) && !element.hasAttribute('tabindex')) {
      this.renderer.setAttribute(element, 'tabindex', '0');
    }

    this.ensureInlineStructure(element, originalText);
  }

  private ensureInlineStructure(element: HTMLElement, originalText: string): void {
    if (!originalText) {
      return;
    }

    if (!this.sourceSpan) {
      this.sourceSpan = this.renderer.createElement('span');
      this.renderer.addClass(this.sourceSpan, 'mist-translate__source');
      this.renderer.setProperty(this.sourceSpan, 'textContent', originalText);

      this.translationSpan = this.renderer.createElement('span');
      this.renderer.addClass(this.translationSpan, 'mist-translate__translation');

      this.renderer.setProperty(element, 'textContent', '');
      this.renderer.appendChild(element, this.sourceSpan);
      this.renderer.appendChild(element, this.translationSpan);
    }

    this.renderer.setProperty(this.translationSpan, 'textContent', this.translatedText);
  }

  private resolveColor(value: string): string {
    const colors: Record<string, string> = {
      air: 'var(--domain-air-secondary)',
      darkness: 'var(--domain-darkness-secondary)',
      death: 'var(--domain-death-secondary)',
      earth: 'var(--domain-earth-secondary)',
      electricity: 'var(--domain-lightning-secondary)',
      fire: 'var(--domain-fire-secondary)',
      life: 'var(--domain-life-secondary)',
      light: 'var(--domain-light-secondary)',
      lightning: 'var(--domain-lightning-secondary)',
      plant: 'var(--domain-plants-secondary)',
      plants: 'var(--domain-plants-secondary)',
      space: 'var(--domain-space-secondary)',
      time: 'var(--domain-time-secondary)',
      water: 'var(--domain-water-secondary)',
    };

    return colors[value.toLowerCase()] ?? value;
  }

  private readDataAttribute(element: HTMLElement, name: string): string {
    const datasetValue = element.dataset?.[name]?.trim();

    if (datasetValue) {
      return datasetValue;
    }

    return element.getAttribute(`data-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`)?.trim() ?? '';
  }

  private isNaturallyFocusable(element: HTMLElement): boolean {
    return ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName);
  }
}
