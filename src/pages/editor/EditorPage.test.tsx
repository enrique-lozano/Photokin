import type { ButtonProps } from '@/components/ui/button';
import { initialEdit } from '@/media/edit/editGeometry';
import type { EditorData } from '@/media/edit/editorProtocol';
import type { ComponentProps, PropsWithChildren, ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type ReactCrop from 'react-image-crop';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorPage } from './EditorPage';

const mocks = vi.hoisted(() => ({
  states: [] as unknown[],
  refs: [] as { current: unknown }[],
  stateIndex: 0,
  refIndex: 0,
  buttons: [] as ButtonProps[],
  crop: undefined as ComponentProps<typeof ReactCrop> | undefined,
  request: vi.fn(),
}));

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useEffect: vi.fn(),
  useState: (initial: unknown) => {
    const index = mocks.stateIndex++;
    if (!(index in mocks.states)) mocks.states[index] = initial;
    return [
      mocks.states[index],
      (value: unknown) => {
        mocks.states[index] = typeof value === 'function' ? value(mocks.states[index]) : value;
      },
    ];
  },
  useRef: (initial: unknown) => {
    const index = mocks.refIndex++;
    return (mocks.refs[index] ??= { current: initial });
  },
}));
vi.mock('@/components/ui/button', () => ({
  Button: (props: ButtonProps) => {
    mocks.buttons.push(props);
    return <span>{props.children}</span>;
  },
}));
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: PropsWithChildren) => children,
  TooltipTrigger: ({ children }: PropsWithChildren) => children,
  TooltipContent: () => null,
}));
vi.mock('react-image-crop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-image-crop')>()),
  default: (props: ComponentProps<typeof ReactCrop>) => {
    mocks.crop = props;
    return <div>{props.children}</div>;
  },
}));
vi.mock('@/media/edit/editorProtocol', () => ({ requestEditor: mocks.request }));
vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: (path: string) => path }));
vi.mock('@tauri-apps/plugin-os', () => ({ platform: () => 'windows' }));
vi.mock('@/system/useWindowControls', () => ({ useWindowControls: () => ({}) }));
vi.mock('@/components/app-shell/WindowControls', () => ({ WindowControls: () => null }));
vi.mock('@/components/ui/toaster', () => ({ AppToaster: () => null }));
vi.mock('@/components/ui/confirmation-dialog', () => ({ ConfirmationDialogHost: () => null }));

const data = {
  id: 'photo',
  fullPath: 'photo.jpg',
  width: 1200,
  height: 800,
  filename: 'photo.jpg',
  format: 'jpg',
  bytes: 100_000,
  previewPath: 'photo.jpg',
  regions: [],
  canOverwrite: true,
} satisfies EditorData;

function render() {
  mocks.stateIndex = 0;
  mocks.refIndex = 0;
  mocks.buttons = [];
  return renderToStaticMarkup(<EditorPage />);
}

function button(label: string) {
  const found = mocks.buttons.find((props) => props['aria-label'] === label);
  expect(found).toBeDefined();
  return found!;
}

function click(label: string) {
  button(label).onClick?.({} as Parameters<NonNullable<ButtonProps['onClick']>>[0]);
  return render();
}

function oriented() {
  return mocks.crop!.children as ReactElement<{
    style: Record<string, unknown>;
    children: [ReactElement<{ onLoad: () => void; style: Record<string, unknown> }>];
  }>;
}

describe('crop canvas preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('window', { location: { search: '?assetId=photo' } });
    mocks.states = [data, initialEdit(data.width, data.height, 'jpg')];
    mocks.refs = [];
    render();
    oriented().props.children[0].props.onLoad();
    render();
  });

  it('only offers the secondary toggle when cropped, fits and offsets the existing image', () => {
    expect(mocks.buttons.some((props) => props['aria-label'] === 'Preview crop')).toBe(false);
    mocks.crop!.onChange!(
      { unit: 'px', x: 0, y: 0, width: 0, height: 0 },
      {
        unit: '%',
        x: 25,
        y: 25,
        width: 50,
        height: 50,
      },
    );
    render();
    expect(button('Preview crop')).toMatchObject({
      variant: 'ghost',
      size: 'icon-sm',
      'aria-pressed': false,
    });
    click('Preview crop');
    expect(mocks.crop).toMatchObject({
      crop: undefined,
      disabled: true,
      style: { width: 600, height: 400, overflow: 'hidden' },
    });
    expect(oriented().props.style).toMatchObject({
      width: 1200,
      height: 800,
      transform: 'translate(-300px, -200px)',
    });
    expect(mocks.request).not.toHaveBeenCalled();
    click('Preview crop');
    expect(mocks.crop?.crop).toMatchObject({ x: 25, y: 25, width: 50, height: 50 });
    expect(mocks.crop?.disabled).toBe(false);
  });

  it('preserves hold-to-Compare and returns to the cropped view on release', () => {
    mocks.crop!.onChange!(
      { unit: 'px', x: 300, y: 200, width: 600, height: 400 },
      { unit: '%', x: 25, y: 25, width: 50, height: 50 },
    );
    render();
    click('Preview crop');
    expect(button('Compare with original').disabled).toBe(false);
    button('Compare with original').onKeyDown?.({
      key: ' ',
      preventDefault() {},
    } as Parameters<NonNullable<ButtonProps['onKeyDown']>>[0]);
    expect(render()).toContain('editor-stage-before');
    expect(button('Preview crop').disabled).toBe(true);
    button('Compare with original').onKeyUp?.({
      key: ' ',
      preventDefault() {},
    } as Parameters<NonNullable<ButtonProps['onKeyUp']>>[0]);
    expect(render()).not.toContain('editor-stage-before');
    expect(button('Preview crop')['aria-pressed']).toBe(true);
    expect(mocks.crop?.style).toMatchObject({ width: 600, height: 400 });
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('fits a rotated and flipped crop within the canvas without changing the edit', () => {
    const edit = {
      ...initialEdit(1200, 800, 'jpg'),
      turns: 1,
      flipHorizontal: true,
      flipVertical: true,
      crop: [0.25, 0.25, 0.5, 0.5],
    };
    mocks.states[1] = edit;
    render();
    click('Preview crop');
    expect(mocks.crop?.style?.width).toBeCloseTo((400 * 502) / 600);
    expect(mocks.crop?.style?.height).toBeCloseTo(502);
    expect(oriented().props.children[0].props.style.transform).toBe(
      'translate(-50%, -50%) scaleX(-1) scaleY(-1) rotate(90deg)',
    );
    expect(mocks.states[1]).toBe(edit);
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
