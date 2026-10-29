import { FilterChip } from '@/components/page-content/FilterChip';
import { Segmented } from '@/components/segmented/Segmented';
import { SettingsTitleBar } from '@/components/settings/SettingsTitleBar';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Banner } from '@/components/ui/banner';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapse } from '@/components/ui/collapse';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { confirm } from '@/components/ui/confirmationDialogStore';
import { ConfirmationDialogHost } from '@/components/ui/confirmation-dialog';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Dialog,
  DialogBody,
  DialogCancel,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { InfoHint } from '@/components/ui/infoHint';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { InputWithIcon } from '@/components/ui/inputWithIcon';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SearchCombobox } from '@/components/ui/search-combobox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SelectionCheck } from '@/components/ui/selection-check';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { SplitButton, SplitButtonMain, SplitButtonMenu } from '@/components/ui/split-button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { AppToaster } from '@/components/ui/toaster';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { VerticalDivider } from '@/components/ui/verticalDivider';
import { SecondaryTitleAndScrollableContent } from '@/pages/search/SecondaryTitleAndScrollableContent';
import {
  IconAlertTriangle,
  IconArrowUpRight,
  IconCheck,
  IconComponents,
  IconCopy,
  IconFolder,
  IconInfoCircle,
  IconMoodSmile,
  IconPhoto,
  IconScan,
  IconSearch,
  IconTag,
  IconTrash,
  IconUsers,
  IconX,
} from '@tabler/icons-react';
import { type ReactNode, useState } from 'react';

const BUTTON_VARIANTS: NonNullable<ButtonProps['variant']>[] = [
  'default',
  'primary-light',
  'outline',
  'outline-primary',
  'secondary',
  'ghost',
  'destructive',
  'link',
  'navbar',
];

const BUTTON_SIZES = [
  { size: 'xs', icon: 'icon-xs', label: 'Extra small' },
  { size: 'sm', icon: 'icon-sm', label: 'Small' },
  { size: 'default', icon: 'icon', label: 'Default' },
  { size: 'lg', icon: 'icon-lg', label: 'Large' },
] as const;

const BADGE_VARIANTS: NonNullable<BadgeProps['variant']>[] = [
  'default',
  'secondary',
  'outline',
  'ghost',
  'link',
  'info',
  'success',
  'warning',
  'destructive',
];

const COLOR_TOKENS = [
  'background',
  'foreground',
  'card',
  'popover',
  'primary',
  'action',
  'secondary',
  'muted',
  'muted-foreground',
  'accent',
  'destructive',
  'destructive-text',
  'success',
  'warning',
  'favorite',
  'border',
  'input',
  'ring',
  'main-navbar',
  'secondary-navbar',
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
  'chart-5',
];

const TEXT_SIZES = ['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl'];

const PEOPLE = ['Alice', 'Bob', 'Charlie', 'Dana', 'Eve', 'Frank', 'Grace'];

function Section({ title, source, children }: { title: string; source: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        <code className="text-xs text-muted-foreground">{source}</code>
      </header>
      {children}
    </section>
  );
}

function Row({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[150px_minmax(0,1fr)] items-center gap-4">
      <code className="text-xs text-muted-foreground">{label}</code>
      <div className={className ?? 'flex flex-wrap items-center gap-3'}>{children}</div>
    </div>
  );
}

function ButtonsSection() {
  return (
    <Section title="Button" source="components/ui/button.tsx">
      {BUTTON_SIZES.map(({ size, icon, label }) => (
        <Row key={size} label={`${size} / ${icon}`}>
          {(['default', 'outline'] as const).map((variant) => (
            <div key={variant} className="flex items-center gap-1.5">
              <Button variant={variant} size={size}>
                {label}
              </Button>
              <Button variant={variant} size={icon} aria-label={label}>
                <IconArrowUpRight size={size === 'xs' ? 14 : 16} />
              </Button>
            </div>
          ))}
        </Row>
      ))}
      <Separator />
      {BUTTON_VARIANTS.map((variant) => (
        <Row
          key={variant}
          label={variant}
          className={
            variant === 'navbar'
              ? 'flex flex-wrap items-center gap-3 rounded-lg bg-main-navbar p-2'
              : 'flex flex-wrap items-center gap-3'
          }
        >
          <Button variant={variant}>Label</Button>
          <Button variant={variant}>
            <IconMoodSmile size={18} /> With icon
          </Button>
          <Button variant={variant} size="icon" aria-label="Icon">
            <IconTag size={18} />
          </Button>
          <Button variant={variant} disabled>
            Disabled
          </Button>
          <Button variant={variant} isLoading>
            Loading
          </Button>
        </Row>
      ))}
    </Section>
  );
}

function BadgesSection() {
  return (
    <Section title="Badge" source="components/ui/badge.tsx">
      {BADGE_VARIANTS.map((variant) => (
        <Row key={variant} label={variant}>
          <Badge variant={variant}>Badge</Badge>
          <Badge variant={variant}>
            <IconCheck /> With icon
          </Badge>
          <Badge variant={variant}>42</Badge>
          <Badge variant={variant} asChild>
            <a href="#badge" onClick={(event) => event.preventDefault()}>
              As link <IconArrowUpRight />
            </a>
          </Badge>
        </Row>
      ))}
    </Section>
  );
}

function SplitButtonsSection() {
  const variants = ['default', 'outline-primary', 'destructive'] as const;
  return (
    <Section title="SplitButton" source="components/ui/split-button.tsx">
      {variants.map((variant) => (
        <Row key={variant} label={variant}>
          <SplitButton variant={variant}>
            <SplitButtonMain tooltip="Main action">
              <IconScan size={18} /> Scan
            </SplitButtonMain>
            <SplitButtonMenu ariaLabel="More actions">
              <DropdownMenuItem>Scan selection</DropdownMenuItem>
              <DropdownMenuItem>Rescan everything</DropdownMenuItem>
            </SplitButtonMenu>
          </SplitButton>
          <SplitButton variant={variant} disabled>
            <SplitButtonMain>
              <IconScan size={18} /> Disabled
            </SplitButtonMain>
            <SplitButtonMenu ariaLabel="More actions" />
          </SplitButton>
        </Row>
      ))}
    </Section>
  );
}

function FieldsSection() {
  const [select, setSelect] = useState('date');
  const [single, setSingle] = useState('');
  const [multiple, setMultiple] = useState<string[]>(['Alice', 'Bob']);

  return (
    <Section
      title="Text fields & pickers"
      source="components/ui/{input,inputWithIcon,input-group,textarea,select,search-combobox}.tsx"
    >
      <Row label="Input default" className="grid grid-cols-3 gap-3">
        <Input placeholder="Placeholder" />
        <Input defaultValue="With value" />
        <Input placeholder="Disabled" disabled />
      </Row>
      <Row label="Input filled" className="grid grid-cols-3 gap-3">
        <Input variant="filled" placeholder="Placeholder" />
        <Input variant="filled" defaultValue="With value" />
        <Input variant="filled" placeholder="Disabled" disabled />
      </Row>
      <Row label="InputWithIcon" className="grid grid-cols-3 gap-3">
        <InputWithIcon startIcon={<IconSearch />} placeholder="Start icon" />
        <InputWithIcon endIcon={<IconX />} placeholder="End icon" />
        <InputWithIcon variant="filled" startIcon={<IconSearch />} placeholder="Filled" />
      </Row>
      <Row label="InputGroup" className="grid grid-cols-3 gap-3">
        <InputGroup>
          <InputGroupAddon>
            <IconSearch />
          </InputGroupAddon>
          <InputGroupInput placeholder="Search…" />
          <InputGroupAddon align="inline-end">
            <Kbd>⌘K</Kbd>
          </InputGroupAddon>
        </InputGroup>
        <InputGroup>
          <InputGroupInput placeholder="With button" />
          <InputGroupAddon align="inline-end">
            <InputGroupButton>Apply</InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </Row>
      <Row label="Textarea" className="grid grid-cols-3 gap-3">
        <Textarea placeholder="Default" />
        <Textarea variant="filled" placeholder="Filled" />
        <Textarea variant="filled" autoResize placeholder="Filled, auto-resize" />
      </Row>
      <Row label="Select" className="grid grid-cols-3 gap-3">
        <Select value={select} onValueChange={setSelect}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date">Date taken</SelectItem>
            <SelectItem value="name">File name</SelectItem>
            <SelectItem value="size">File size</SelectItem>
          </SelectContent>
        </Select>
        <div>
          <Select value={select} onValueChange={setSelect}>
            <SelectTrigger optionLabels={['Date taken', 'File name', 'File size']}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">Date taken</SelectItem>
              <SelectItem value="name">File name</SelectItem>
              <SelectItem value="size">File size</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Select disabled>
          <SelectTrigger>
            <SelectValue placeholder="Disabled" />
          </SelectTrigger>
          <SelectContent />
        </Select>
      </Row>
      <Row label="Select size=sm">
        <Select value={select} onValueChange={setSelect}>
          <SelectTrigger size="sm" optionLabels={['Date taken', 'File name', 'File size']}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date">Date taken</SelectItem>
            <SelectItem value="name">File name</SelectItem>
            <SelectItem value="size">File size</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm">
          Small button
        </Button>
      </Row>
      <Row label="SearchCombobox" className="grid grid-cols-3 gap-3">
        <SearchCombobox options={PEOPLE} value={single} onValueChange={setSingle} placeholder="Single…" />
        <SearchCombobox
          multiple
          options={PEOPLE}
          value={multiple}
          onValueChange={setMultiple}
          placeholder="Multiple…"
        />
        <SearchCombobox options={PEOPLE} value="" onValueChange={() => {}} placeholder="Disabled" disabled />
      </Row>
    </Section>
  );
}

function TogglesSection() {
  const [checked, setChecked] = useState(true);
  const [on, setOn] = useState(true);
  const [value, setValue] = useState([40]);
  const [range, setRange] = useState([20, 70]);
  const [view, setView] = useState<'gallery' | 'faces'>('gallery');
  const [period, setPeriod] = useState<'month' | 'day'>('month');
  const [type, setType] = useState<'exact' | 'similar'>('exact');
  const [chip, setChip] = useState(true);

  return (
    <Section
      title="Toggles & selection"
      source="components/ui/{checkbox,switch,slider}.tsx · segmented · page-content/FilterChip"
    >
      <Row label="Checkbox">
        <Checkbox
          checked={checked}
          onCheckedChange={(state) => setChecked(state === true)}
          aria-label="Checked"
        />
        <Checkbox aria-label="Unchecked" />
        <Checkbox checked="indeterminate" aria-label="Indeterminate" />
        <Checkbox checked disabled aria-label="Disabled" />
        <label className="flex items-center gap-2 text-sm">
          <Checkbox /> With label
        </label>
      </Row>
      <Row label="Switch">
        <Switch checked={on} onCheckedChange={setOn} aria-label="On" />
        <Switch aria-label="Off" />
        <Switch checked disabled aria-label="Disabled" />
      </Row>
      <Row label="SelectionCheck">
        <div className="flex gap-2 rounded-lg bg-muted-foreground p-2">
          <SelectionCheck selected />
          <SelectionCheck selected={false} />
        </div>
      </Row>
      <Row label="Slider" className="grid grid-cols-3 items-center gap-6">
        <Slider value={value} onValueChange={setValue} max={100} aria-label="Value" />
        <Slider value={range} onValueChange={setRange} max={100} aria-label="Range" />
        <Slider defaultValue={[60]} max={100} disabled aria-label="Disabled" />
      </Row>
      <Row label="Segmented">
        <Segmented
          ariaLabel="View"
          value={view}
          onChange={setView}
          options={[
            { value: 'gallery', label: 'Gallery', icon: <IconPhoto size={16} /> },
            { value: 'faces', label: 'Faces', icon: <IconUsers size={16} /> },
          ]}
        />
        <div className="w-64">
          <Segmented
            ariaLabel="Period"
            fill
            value={period}
            onChange={setPeriod}
            options={[
              { value: 'month', label: 'Month' },
              { value: 'day', label: 'Day' },
            ]}
          />
        </div>
        <Segmented
          ariaLabel="Type"
          stacked
          value={type}
          onChange={setType}
          options={[
            { value: 'exact', label: 'Exact', count: 12 },
            { value: 'similar', label: 'Similar', count: 48 },
          ]}
        />
      </Row>
      <Row label="FilterChip">
        <FilterChip label="Toggle me" active={chip} onClick={() => setChip(!chip)} />
        <FilterChip label="Inactive" />
        <FilterChip label="With count" count={1234} />
        <FilterChip
          label="With leading"
          leading={<span className="block size-2 rounded-full bg-chart-2" />}
          count={8}
        />
      </Row>
    </Section>
  );
}

function OverlaysSection() {
  return (
    <Section
      title="Overlays & menus"
      source="components/ui/{dialog,alert-dialog,confirmation-dialog,drawer,popover,dropdown-menu,context-menu,tooltip}.tsx"
    >
      <Row label="Dialog">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">Open dialog</Button>
          </DialogTrigger>
          <DialogContent className="w-[min(80vw,32rem)]">
            <DialogHeader>
              <DialogTitle>Dialog title</DialogTitle>
              <DialogDescription>Supporting description text.</DialogDescription>
            </DialogHeader>
            <DialogBody>
              <Input placeholder="Some field" />
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <DialogCancel>Cancel</DialogCancel>
              </DialogClose>
              <DialogClose asChild>
                <Button>Save</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline">Open alert dialog</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Alert title</AlertDialogTitle>
              <AlertDialogDescription>Plain alert dialog primitive.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction>Continue</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Row>
      <Row label="confirm()">
        <Button
          variant="outline"
          onClick={() =>
            void confirm({
              icon: <IconCopy size={22} />,
              title: 'Default tone',
              description: 'A neutral confirmation.',
              confirmLabel: 'Confirm',
            })
          }
        >
          default
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            void confirm({
              icon: <IconAlertTriangle size={22} />,
              title: 'Warning tone',
              description: 'Something to be careful about.',
              confirmLabel: 'Continue',
              tone: 'warning',
            })
          }
        >
          warning
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            void confirm({
              icon: <IconTrash size={22} />,
              title: 'Destructive tone',
              description: 'This cannot be undone.',
              confirmLabel: 'Delete',
              tone: 'destructive',
            })
          }
        >
          destructive
        </Button>
      </Row>
      <Row label="Drawer">
        <Drawer>
          <DrawerTrigger asChild>
            <Button variant="outline">Open drawer</Button>
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <div>
                <DrawerTitle>Drawer title</DrawerTitle>
                <DrawerDescription>Side panel content.</DrawerDescription>
              </div>
            </DrawerHeader>
            <DrawerBody>Body</DrawerBody>
            <DrawerFooter>Footer</DrawerFooter>
          </DrawerContent>
        </Drawer>
      </Row>
      <Row label="Popover">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">Open popover</Button>
          </PopoverTrigger>
          <PopoverContent>
            <p className="text-sm">Popover content.</p>
          </PopoverContent>
        </Popover>
      </Row>
      <Row label="DropdownMenu">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">Open menu</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Label</DropdownMenuLabel>
            <DropdownMenuItem>
              <IconFolder size={16} /> Item with icon
            </DropdownMenuItem>
            <DropdownMenuItem disabled>Disabled item</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem checked>Checkbox item</DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup value="a">
              <DropdownMenuRadioItem value="a">Radio A</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="b">Radio B</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </Row>
      <Row label="ContextMenu">
        <ContextMenu>
          <ContextMenuTrigger className="flex h-16 w-64 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
            Right-click here
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem>Open</ContextMenuItem>
            <ContextMenuItem>Rename</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem className="text-destructive-text">Delete</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </Row>
      <Row label="Tooltip / InfoHint">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline">Hover me</Button>
          </TooltipTrigger>
          <TooltipContent>Tooltip content</TooltipContent>
        </Tooltip>
        <span className="flex items-center gap-1.5 text-sm">
          Label <InfoHint>Longer explanation revealed on hover.</InfoHint>
        </span>
      </Row>
      <Row label="Command" className="block">
        <Command className="w-80 border border-border">
          <CommandInput placeholder="Type a command…" />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup heading="Suggestions">
              <CommandItem>
                <IconPhoto /> Photos <CommandShortcut>⌘P</CommandShortcut>
              </CommandItem>
              <CommandItem>
                <IconUsers /> People
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Other">
              <CommandItem>
                <IconTag /> Tags
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </Row>
    </Section>
  );
}

function FeedbackSection() {
  return (
    <Section title="Toasts" source="components/ui/toast.tsx">
      <Row label="toast.*">
        <Button variant="outline" onClick={() => toast('Default message')}>
          default
        </Button>
        <Button variant="outline" onClick={() => toast.success('Saved')}>
          success
        </Button>
        <Button variant="outline" onClick={() => toast.info('For your information')}>
          info
        </Button>
        <Button variant="outline" onClick={() => toast.warning('Be careful')}>
          warning
        </Button>
        <Button variant="outline" onClick={() => toast.error('Something failed')}>
          error
        </Button>
        <Button variant="outline" onClick={() => toast.loading('Working…', { id: 'demo-loading' })}>
          loading
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            toast.success('Moved to trash', {
              description: '3 photos',
              action: { label: 'Undo', onClick: () => {} },
            })
          }
        >
          with action
        </Button>
        <Button variant="ghost" onClick={() => toast.dismiss()}>
          Dismiss all
        </Button>
      </Row>
    </Section>
  );
}

function BannersSection() {
  return (
    <Section title="Banner" source="components/ui/banner.tsx">
      <Row label="neutral" className="flex max-w-md flex-col gap-3">
        <Banner icon={<IconInfoCircle size={18} />}>Inline context that sits in the content flow.</Banner>
      </Row>
      <Row label="warning" className="flex max-w-md flex-col gap-3">
        <Banner variant="warning" icon={<IconAlertTriangle size={18} />}>
          Something to be careful about before continuing.
        </Banner>
      </Row>
    </Section>
  );
}

function LayoutSection() {
  const [open, setOpen] = useState(true);

  return (
    <Section
      title="Layout & misc"
      source="components/ui/{accordion,collapse,separator,verticalDivider,skeleton,kbd}.tsx"
    >
      <Row label="Accordion" className="block max-w-md">
        <Accordion type="single" collapsible defaultValue="one">
          <AccordionItem value="one">
            <AccordionTrigger>First item</AccordionTrigger>
            <AccordionContent>Content of the first item.</AccordionContent>
          </AccordionItem>
          <AccordionItem value="two">
            <AccordionTrigger>Second item</AccordionTrigger>
            <AccordionContent>Content of the second item.</AccordionContent>
          </AccordionItem>
        </Accordion>
      </Row>
      <Row label="Collapse" className="flex flex-col items-start gap-2">
        <Button variant="outline" size="sm" onClick={() => setOpen(!open)}>
          Toggle
        </Button>
        <Collapse open={open}>
          <p className="text-sm text-muted-foreground">Animated collapsible content.</p>
        </Collapse>
      </Row>
      <Row label="Separator" className="flex h-8 items-center gap-3 text-sm">
        <span>Left</span>
        <Separator orientation="vertical" />
        <span>Right</span>
        <Separator className="w-32" />
      </Row>
      <Row label="VerticalDivider" className="flex items-center gap-2 text-sm">
        <span>Group A</span>
        <VerticalDivider />
        <span>Group B</span>
      </Row>
      <Row label="Skeleton">
        <Skeleton className="size-16 rounded-lg" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-48 rounded" />
          <Skeleton className="h-4 w-32 rounded" />
        </div>
      </Row>
      <Row label="Kbd">
        <Kbd>Esc</Kbd>
        <KbdGroup>
          <Kbd>Ctrl</Kbd>
          <Kbd>Shift</Kbd>
          <Kbd>P</Kbd>
        </KbdGroup>
      </Row>
    </Section>
  );
}

function FoundationsSection() {
  return (
    <Section title="Colors & typography" source="App.css (--color-*)">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
        {COLOR_TOKENS.map((token) => (
          <div key={token} className="flex flex-col gap-1.5">
            <div
              className="h-12 rounded-lg border border-border"
              style={{ background: `var(--color-${token})` }}
            />
            <code className="text-xs text-muted-foreground">{token}</code>
          </div>
        ))}
      </div>
      <Separator />
      {TEXT_SIZES.map((size) => (
        <Row key={size} label={size}>
          <span className={`${size} font-normal`}>Regular</span>
          <span className={`${size} font-medium`}>Medium</span>
          <span className={`${size} font-semibold`}>Semibold</span>
          <span className={`${size} text-muted-foreground`}>Muted</span>
        </Row>
      ))}
    </Section>
  );
}

/** Living style guide of the shared UI building blocks. */
export function ComponentsPage() {
  return (
    <div className="flex h-screen w-full min-w-0 flex-col overflow-hidden bg-background text-foreground">
      <SettingsTitleBar title="Components" />
      <main className="flex min-h-0 flex-1">
        <SecondaryTitleAndScrollableContent
          icon={<IconComponents />}
          title="Components"
          subtitle="Every reusable component and its variants"
          content={
            <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 pb-10 pt-5">
              <FoundationsSection />
              <ButtonsSection />
              <BadgesSection />
              <SplitButtonsSection />
              <FieldsSection />
              <TogglesSection />
              <OverlaysSection />
              <FeedbackSection />
              <BannersSection />
              <LayoutSection />
            </div>
          }
        />
      </main>
      <AppToaster />
      <ConfirmationDialogHost />
    </div>
  );
}
