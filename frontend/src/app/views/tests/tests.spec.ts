import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Tests } from './tests';

describe('Tests', () => {
  let component: Tests;
  let fixture: ComponentFixture<Tests>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Tests],
    }).compileComponents();

    fixture = TestBed.createComponent(Tests);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
