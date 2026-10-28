import React from 'react';

interface DistrictLogoProps {
  className?: string;
  size?: number;
}

export const DistrictLogo: React.FC<DistrictLogoProps> = ({
  className = 'w-5 h-5 text-white',
  size,
}) => {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      {/* Dual 45° Angled Barrier Boom Lines */}
      <g transform="rotate(-45 50 50)">
        <rect
          x="10"
          y="15"
          width="80"
          height="7.5"
          rx="1.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="4.5"
        />
        <rect
          x="10"
          y="77.5"
          width="80"
          height="7.5"
          rx="1.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="4.5"
        />
      </g>
      {/* Center Chamfered Architectural 'P' */}
      <path
        d="
          M 37 74
          L 37 42
          L 49 30
          L 63 30
          C 74 30 80 36 80 47
          C 80 58 74 64 63 64
          L 49 64
          L 49 74
          Z
          M 49 41
          L 49 53
          L 62 53
          C 67 53 69 51 69 47
          C 69 43 67 41 62 41
          Z
        "
        fillRule="evenodd"
      />
    </svg>
  );
};

export default DistrictLogo;
