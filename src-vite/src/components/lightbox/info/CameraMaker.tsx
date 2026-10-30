import { IconCamera } from '@tabler/icons-react';
import {
  siApple,
  siBlackmagicdesign,
  siDji,
  siEpson,
  siFujifilm,
  siGoogle,
  siHonor,
  siHuawei,
  siInsta360,
  siKodak,
  siLeica,
  siLg,
  siMotorola,
  siNikon,
  siNokia,
  siOneplus,
  siOppo,
  siPanasonic,
  siSamsung,
  siSony,
  siVivo,
  siXiaomi,
  type SimpleIcon,
} from 'simple-icons';

// Brands Simple Icons has no mark for render as a wordmark instead of a drawn logo.
const BRANDS: { label: string; match: string[]; icon?: SimpleIcon }[] = [
  { label: 'Canon', match: ['canon'] },
  { label: 'Nikon', match: ['nikon'], icon: siNikon },
  { label: 'Fujifilm', match: ['fujifilm', 'fujiphoto'], icon: siFujifilm },
  { label: 'Sony', match: ['sony'], icon: siSony },
  { label: 'Panasonic', match: ['panasonic'], icon: siPanasonic },
  { label: 'Leica', match: ['leica'], icon: siLeica },
  { label: 'Apple', match: ['apple'], icon: siApple },
  { label: 'Samsung', match: ['samsung'], icon: siSamsung },
  { label: 'Google', match: ['google'], icon: siGoogle },
  { label: 'Xiaomi', match: ['xiaomi', 'redmi'], icon: siXiaomi },
  { label: 'Huawei', match: ['huawei'], icon: siHuawei },
  { label: 'OnePlus', match: ['oneplus'], icon: siOneplus },
  { label: 'OPPO', match: ['oppo'], icon: siOppo },
  { label: 'vivo', match: ['vivo'], icon: siVivo },
  { label: 'Motorola', match: ['motorola'], icon: siMotorola },
  { label: 'Honor', match: ['honor'], icon: siHonor },
  { label: 'Nokia', match: ['nokia', 'hmdglobal'], icon: siNokia },
  { label: 'LG', match: ['lgelectronics', 'lg'], icon: siLg },
  { label: 'DJI', match: ['dji'], icon: siDji },
  { label: 'Kodak', match: ['kodak', 'eastmankodak'], icon: siKodak },
  { label: 'Insta360', match: ['insta360', 'arashivision'], icon: siInsta360 },
  { label: 'Blackmagic', match: ['blackmagic'], icon: siBlackmagicdesign },
  { label: 'Epson', match: ['epson', 'seikoepson'], icon: siEpson },
  { label: 'Olympus', match: ['olympus'] },
  { label: 'OM System', match: ['omdigital', 'omsystem'] },
  { label: 'Pentax', match: ['pentax', 'asahi'] },
  { label: 'Ricoh', match: ['ricoh'] },
  { label: 'Hasselblad', match: ['hasselblad'] },
  { label: 'Sigma', match: ['sigma'] },
  { label: 'GoPro', match: ['gopro'] },
  { label: 'Casio', match: ['casio'] },
  { label: 'Minolta', match: ['minolta', 'konicaminolta'] },
];

const keyOf = (label: string) => label.toLowerCase().replace(/[^a-z0-9]/g, '');

function brandOf(make: string | null) {
  const text = keyOf(make ?? '');
  return text ? BRANDS.find((brand) => brand.match.some((prefix) => text.startsWith(prefix))) : undefined;
}

export function normalizeMaker(make: string | null): string | null {
  const brand = brandOf(make);
  return brand ? keyOf(brand.label) : null;
}

export function CameraMaker({ make, empty }: { make: string | null; empty: boolean }) {
  const brand = brandOf(make);
  return (
    <span className={`camera-maker ${empty ? 'camera-maker--empty' : ''}`} title={make ?? 'Camera'}>
      {brand?.icon ? (
        <svg viewBox="0 0 24 24" fill="currentColor" role="img" aria-label={brand.label}>
          <path d={brand.icon.path} />
        </svg>
      ) : brand ? (
        <span
          className={`camera-maker__wordmark${brand.label.length > 6 ? ' camera-maker__wordmark--long' : ''}`}
          aria-label={brand.label}
        >
          {brand.label}
        </span>
      ) : (
        <IconCamera aria-hidden />
      )}
    </span>
  );
}
