import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  SettingsButtonRow,
  SettingsGroup,
  SettingsRadioGroup,
  SettingsRow,
  SettingsSelectRow,
  SettingsToggleRow,
} from './SettingsRow';

describe('settings rows', () => {
  it('renders one labelled radio per choice with the current one checked', () => {
    const html = renderToStaticMarkup(
      <SettingsRadioGroup
        label="Write mode"
        value="readonly"
        options={[
          { value: 'readonly', label: 'Read only', badge: 'Recommended' },
          { value: 'full', label: 'Sync to files', description: 'Writes into files.' },
        ]}
        onValueChange={vi.fn()}
      />,
    );
    expect(html).toContain('role="radiogroup" aria-label="Write mode"');
    expect(html.match(/type="radio"/g)).toHaveLength(2);
    expect(html).toMatch(/checked="" value="readonly"/);
    expect(html).not.toMatch(/checked="" value="full"/);
    expect(html).toContain('Recommended');
    expect(html).not.toContain('settings-row__icon');
  });

  it('only renders an icon slot when given an icon', () => {
    expect(renderToStaticMarkup(<SettingsRow label="Plain" />)).not.toContain('settings-row__icon');
    expect(renderToStaticMarkup(<SettingsRow icon={<svg />} label="Icon" />)).toContain('settings-row__icon');
  });

  it('places section context before the card, not among its settings', () => {
    const html = renderToStaticMarkup(
      <SettingsGroup title="Library" description="Section context">
        <SettingsRow label="A setting" />
      </SettingsGroup>,
    );
    expect(html.indexOf('Section context')).toBeLessThan(html.indexOf('class="settings-card"'));
    expect(html).toContain('settings-group__description');
  });

  it('associates the entire toggle row with its switch and separate description', () => {
    const html = renderToStaticMarkup(
      <SettingsToggleRow
        label="Scan at startup"
        description="Find new photos."
        checked
        onCheckedChange={vi.fn()}
      />,
    );
    const controlId = html.match(/<label for="([^"]+)"/)?.[1];
    expect(controlId).toBeTruthy();
    expect(html).toContain(`id="${controlId}"`);
    expect(html).toContain('role="switch" aria-checked="true"');
    expect(html).toContain('aria-label="Scan at startup"');
    expect(html).toContain('aria-describedby=');
  });

  it('keeps action rows inert while the button owns its handler', () => {
    const onAction = vi.fn();
    const row = SettingsButtonRow({ label: 'Sync library', buttonLabel: 'Sync now', onAction });
    expect(row.props.onClick).toBeUndefined();
    const html = renderToStaticMarkup(row);
    expect(html).not.toContain('settings-row--interactive');
    expect(html).toContain('Sync now');
  });

  it('does not give menu rows whole-row hover or click behavior', () => {
    const html = renderToStaticMarkup(
      <SettingsSelectRow
        label="Theme"
        value="dark"
        options={[{ value: 'dark', label: 'Dark' }]}
        onValueChange={vi.fn()}
      />,
    );
    expect(html).not.toContain('settings-row--interactive');
    expect(html).toContain('role="combobox"');
  });

  it('preserves disabled switches and loading action buttons', () => {
    const toggle = renderToStaticMarkup(
      <SettingsToggleRow label="Scan" checked={false} disabled onCheckedChange={vi.fn()} />,
    );
    expect(toggle).toContain('data-disabled="true"');
    expect(toggle).toContain('disabled=""');
    const button = renderToStaticMarkup(
      <SettingsButtonRow label="Sync library" buttonLabel="Syncing…" onAction={vi.fn()} isLoading />,
    );
    expect(button).toContain('aria-busy="true"');
    expect(button).toContain('disabled=""');
  });
});
