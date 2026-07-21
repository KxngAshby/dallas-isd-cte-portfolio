import cteLogo from '../assets/cte-logo.png';

type Props = {
  className?: string;
  /** Kept for call sites; logo PNG already has a transparent background */
  onDark?: boolean;
  height?: number;
  alt?: string;
};

export function BrandLogo({
  className = '',
  height = 36,
  alt = 'Dallas ISD CTE',
}: Props) {
  return (
    <img
      src={cteLogo}
      alt={alt}
      style={{ height, width: 'auto' }}
      className={className}
    />
  );
}
