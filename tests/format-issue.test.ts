import { describe, expect, it } from 'vitest';
import { cleanDescription, cleanIssueTitle } from '../src/lib/format';

describe('cleanIssueTitle', () => {
  it('drops emoji and bracketed labels in front', () => {
    expect(cleanIssueTitle('✨(enhancement) add dark mode')).toBe('Add dark mode');
    expect(cleanIssueTitle('🐛 [Bug] Crash on save')).toBe('Crash on save');
    expect(cleanIssueTitle('feat: export to CSV')).toBe('Export to CSV');
  });
  it('leaves ordinary titles alone', () => {
    expect(cleanIssueTitle('Support RTL languages')).toBe('Support RTL languages');
    expect(cleanIssueTitle('iOS: widget breaks')).toBe('iOS: widget breaks');
  });
});

describe('cleanDescription', () => {
  it('drops shortcodes and stutters', () => {
    expect(cleanDescription(':date: Easy!Appointments - Self Hosted')).toBe('Easy!Appointments - Self Hosted');
    expect(cleanDescription('Gantt Gantt Gantt Timeline Schedule')).toBe('Gantt Timeline Schedule');
    expect(cleanDescription('   ')).toBeNull();
  });
});
